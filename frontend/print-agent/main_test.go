package main

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

type fakeSpooler struct {
	printers []string
	def      string
	jobs     map[string][][]byte
}

func (f *fakeSpooler) Printers() ([]string, error)     { return f.printers, nil }
func (f *fakeSpooler) DefaultPrinter() (string, error) { return f.def, nil }
func (f *fakeSpooler) PrintRaw(p, _ string, data []byte) error {
	f.jobs[p] = append(f.jobs[p], data)
	return nil
}

func call(s http.Handler, method, path, origin string, body any) *httptest.ResponseRecorder {
	var buf bytes.Buffer
	if body != nil {
		_ = json.NewEncoder(&buf).Encode(body)
	}
	r := httptest.NewRequest(method, path, &buf)
	if origin != "" {
		r.Header.Set("Origin", origin)
	}
	r.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	s.ServeHTTP(w, r)
	return w
}

func TestOnlyXaskaPagesAreServed(t *testing.T) {
	f := &fakeSpooler{printers: []string{"POS-80"}, def: "POS-80", jobs: map[string][][]byte{}}
	s := &server{spool: f}
	if w := call(s, "GET", "/status", "https://evil.example", nil); w.Code != http.StatusForbidden {
		t.Fatalf("origen ajeno: %d", w.Code)
	}
	if w := call(s, "GET", "/status", "", nil); w.Code != http.StatusForbidden {
		t.Fatalf("sin origen: %d", w.Code)
	}
	w := call(s, "OPTIONS", "/print", "https://app.xaska.co", nil)
	if w.Code != http.StatusNoContent || w.Header().Get("Access-Control-Allow-Private-Network") != "true" {
		t.Fatalf("preflight: %d %v", w.Code, w.Header())
	}
	w = call(s, "GET", "/status", "http://localhost:4200", nil)
	if w.Code != 200 || !bytes.Contains(w.Body.Bytes(), []byte(`"printers":["POS-80"]`)) {
		t.Fatalf("status: %d %s", w.Code, w.Body)
	}
}

func TestPrintAndDrawer(t *testing.T) {
	f := &fakeSpooler{printers: []string{"POS-80", "Cocina"}, def: "POS-80", jobs: map[string][][]byte{}}
	s := &server{spool: f}
	origin := "https://app.xaska.co"
	if w := call(s, "POST", "/print", origin, map[string]any{"printer": "Cocina", "data": []byte("hola")}); w.Code != 200 {
		t.Fatalf("print: %d %s", w.Code, w.Body)
	}
	if string(f.jobs["Cocina"][0]) != "hola" {
		t.Fatalf("no llegó el tiquete: %v", f.jobs)
	}
	if w := call(s, "POST", "/print", origin, map[string]any{"printer": "Otra", "data": []byte("x")}); w.Code != 422 {
		t.Fatalf("impresora inexistente: %d", w.Code)
	}
	if w := call(s, "POST", "/print", origin, map[string]any{"data": []byte{}}); w.Code != 400 {
		t.Fatalf("vacío: %d", w.Code)
	}
	// El cajón: solo el pulso, aunque manden otros bytes; sin nombre va a la predeterminada.
	if w := call(s, "POST", "/drawer", origin, map[string]any{"data": []byte("cualquier cosa")}); w.Code != 200 {
		t.Fatalf("drawer: %d %s", w.Code, w.Body)
	}
	if !bytes.Equal(f.jobs["POS-80"][0], DrawerKick) {
		t.Fatalf("pulso: %v", f.jobs["POS-80"])
	}
}

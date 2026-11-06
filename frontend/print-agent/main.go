// XASKA Impresora: programa pequeño que corre en el computador de la caja y deja que la app de XASKA imprima el
// tiquete directo en la impresora térmica (sin la ventana de impresión) y abra el cajón monedero (decisión 286).
//
// No se copia a otra carpeta ni corre escondido: funciona desde donde se guardó, y solo si la persona dice que sí
// queda para arrancar con Windows (una entrada en "Run" de su usuario). Escucha solo en 127.0.0.1 y solo atiende a las
// páginas de XASKA (cabecera Origin). Recibe los bytes ESC/POS ya
// armados por la app y los manda tal cual (RAW) a la cola de Windows de la impresora elegida, así la impresora sigue
// funcionando con su driver normal para los demás programas.
package main

import (
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"os"
	"strings"
	"time"
)

// Version del programa (la app la muestra en Ajustes).
const Version = "1.0.0"

// Port fijo: la app lo busca aquí.
const Port = 17777

// MaxJob: un tiquete con logo no pasa de unos KB; 1 MB es de sobra.
const MaxJob = 1 << 20

// DrawerKick: pulso al cajón conectado a la impresora (ESC p 0 25 250: pin 2, 50 ms encendido, 500 ms apagado).
var DrawerKick = []byte{0x1b, 0x70, 0x00, 0x19, 0xfa}

// Spooler: lo que el programa necesita del sistema (Windows en la caja; uno falso en las pruebas).
type Spooler interface {
	Printers() ([]string, error)
	DefaultPrinter() (string, error)
	PrintRaw(printer string, doc string, data []byte) error
}

// allowedOrigin: páginas de XASKA (producción y desarrollo).
func allowedOrigin(origin string, extra []string) bool {
	switch origin {
	case "https://app.xaska.co", "https://xaska.co", "http://localhost:4200", "http://127.0.0.1:4200":
		return true
	}
	for _, o := range extra {
		if o != "" && strings.EqualFold(strings.TrimRight(o, "/"), origin) {
			return true
		}
	}
	return false
}

type server struct {
	spool Spooler
	extra []string
}

type statusResponse struct {
	App      string   `json:"app"`
	Version  string   `json:"version"`
	Printers []string `json:"printers"`
	Default  string   `json:"default"`
}

type jobRequest struct {
	Printer string `json:"printer"`
	// Data: bytes ESC/POS (en JSON se envían en base64).
	Data []byte `json:"data"`
	Doc  string `json:"doc"`
}

func (s *server) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	origin := r.Header.Get("Origin")
	if !allowedOrigin(origin, s.extra) {
		http.Error(w, "origen no permitido", http.StatusForbidden)
		return
	}
	h := w.Header()
	h.Set("Access-Control-Allow-Origin", origin)
	h.Set("Vary", "Origin")
	h.Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
	h.Set("Access-Control-Allow-Headers", "Content-Type")
	// Chrome pide permiso para que una página de internet le hable a 127.0.0.1 (Private Network Access).
	h.Set("Access-Control-Allow-Private-Network", "true")
	h.Set("Access-Control-Max-Age", "600")
	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusNoContent)
		return
	}
	switch {
	case r.Method == http.MethodGet && r.URL.Path == "/status":
		s.status(w)
	case r.Method == http.MethodPost && r.URL.Path == "/print":
		s.job(w, r, false)
	case r.Method == http.MethodPost && r.URL.Path == "/drawer":
		s.job(w, r, true)
	default:
		http.NotFound(w, r)
	}
}

func (s *server) status(w http.ResponseWriter) {
	printers, err := s.spool.Printers()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "No se pudo leer la lista de impresoras: "+err.Error())
		return
	}
	def, _ := s.spool.DefaultPrinter()
	if printers == nil {
		printers = []string{}
	}
	writeJSON(w, http.StatusOK, statusResponse{App: "xaska-impresora", Version: Version, Printers: printers, Default: def})
}

func (s *server) job(w http.ResponseWriter, r *http.Request, drawer bool) {
	if !strings.HasPrefix(r.Header.Get("Content-Type"), "application/json") {
		writeError(w, http.StatusUnsupportedMediaType, "Se esperaba JSON.")
		return
	}
	var req jobRequest
	if err := json.NewDecoder(io.LimitReader(r.Body, MaxJob*2)).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "Trabajo de impresión inválido.")
		return
	}
	printer, err := s.resolve(req.Printer)
	if err != nil {
		writeError(w, http.StatusUnprocessableEntity, err.Error())
		return
	}
	data, doc := req.Data, req.Doc
	if drawer {
		data, doc = DrawerKick, "Abrir cajón"
	} else if len(data) == 0 || len(data) > MaxJob {
		writeError(w, http.StatusBadRequest, "El tiquete está vacío o es demasiado grande.")
		return
	}
	if doc == "" {
		doc = "Tiquete XASKA"
	}
	if err := s.spool.PrintRaw(printer, doc, data); err != nil {
		writeError(w, http.StatusBadGateway, "La impresora "+printer+" no recibió el trabajo: "+err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "printer": printer})
}

// resolve: la impresora pedida si existe; sin nombre, la predeterminada de Windows.
func (s *server) resolve(name string) (string, error) {
	printers, err := s.spool.Printers()
	if err != nil {
		return "", errors.New("No se pudo leer la lista de impresoras.")
	}
	if name == "" {
		def, _ := s.spool.DefaultPrinter()
		if def == "" {
			return "", errors.New("Elige la impresora en Ajustes → Impresora de este equipo.")
		}
		return def, nil
	}
	for _, p := range printers {
		if p == name {
			return p, nil
		}
	}
	return "", fmt.Errorf("No encuentro la impresora %q en este computador. Revisa que esté conectada y prendida.", name)
}

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}

func writeError(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, map[string]string{"error": message})
}

func main() {
	uninstall := flag.Bool("uninstall", false, "quitar el arranque con Windows")
	serve := flag.Bool("serve", false, "atender sin preguntar nada (lo usa el arranque con Windows)")
	origins := flag.String("origins", os.Getenv("XASKA_ORIGINS"), "orígenes extra permitidos, separados por coma")
	flag.Parse()

	if *uninstall {
		info(setAutostart(false), "XASKA Impresora ya no arranca con Windows. Puedes borrar este archivo cuando quieras.")
		return
	}
	ln, err := net.Listen("tcp", fmt.Sprintf("127.0.0.1:%d", Port))
	if err != nil {
		// Ya hay uno corriendo (o el puerto está ocupado): no se arranca otro.
		if !*serve {
			info(nil, "XASKA Impresora ya está funcionando en este computador.")
		}
		return
	}
	if !*serve {
		// Abierto con doble clic: avisa que quedó funcionando y pregunta (una vez) si arranca con Windows.
		go welcome()
	}
	srv := &http.Server{
		Handler:           &server{spool: systemSpooler(), extra: strings.Split(*origins, ",")},
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       15 * time.Second,
		WriteTimeout:      30 * time.Second,
	}
	log.Fatal(srv.Serve(ln))
}

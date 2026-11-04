//go:build windows

package main

import (
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"
	"unsafe"
)

var (
	winspool              = syscall.NewLazyDLL("winspool.drv")
	procEnumPrinters      = winspool.NewProc("EnumPrintersW")
	procGetDefaultPrinter = winspool.NewProc("GetDefaultPrinterW")
	procOpenPrinter       = winspool.NewProc("OpenPrinterW")
	procClosePrinter      = winspool.NewProc("ClosePrinter")
	procStartDocPrinter   = winspool.NewProc("StartDocPrinterW")
	procEndDocPrinter     = winspool.NewProc("EndDocPrinter")
	procStartPagePrinter  = winspool.NewProc("StartPagePrinter")
	procEndPagePrinter    = winspool.NewProc("EndPagePrinter")
	procWritePrinter      = winspool.NewProc("WritePrinter")
	user32                = syscall.NewLazyDLL("user32.dll")
	procMessageBox        = user32.NewProc("MessageBoxW")
)

const (
	printerEnumLocal       = 0x2
	printerEnumConnections = 0x4
	errInsufficientBuffer  = syscall.Errno(122)
	createNoWindow         = 0x08000000
	runKey                 = `HKCU\Software\Microsoft\Windows\CurrentVersion\Run`
	runValue               = "XASKA Impresora"
	exeName                = "XASKA-Impresora.exe"
)

type printerInfo4 struct {
	PrinterName *uint16
	ServerName  *uint16
	Attributes  uint32
}

type docInfo1 struct {
	DocName    *uint16
	OutputFile *uint16
	Datatype   *uint16
}

type winSpooler struct{}

func systemSpooler() Spooler { return winSpooler{} }

func (winSpooler) Printers() ([]string, error) {
	flags := uintptr(printerEnumLocal | printerEnumConnections)
	var needed, returned uint32
	r, _, err := procEnumPrinters.Call(flags, 0, 4, 0, 0, uintptr(unsafe.Pointer(&needed)), uintptr(unsafe.Pointer(&returned)))
	if r == 0 && err != errInsufficientBuffer {
		if needed == 0 {
			return []string{}, nil
		}
	}
	if needed == 0 {
		return []string{}, nil
	}
	buf := make([]byte, needed)
	r, _, err = procEnumPrinters.Call(flags, 0, 4, uintptr(unsafe.Pointer(&buf[0])), uintptr(needed),
		uintptr(unsafe.Pointer(&needed)), uintptr(unsafe.Pointer(&returned)))
	if r == 0 {
		return nil, err
	}
	size := unsafe.Sizeof(printerInfo4{})
	names := make([]string, 0, returned)
	for i := uint32(0); i < returned; i++ {
		info := (*printerInfo4)(unsafe.Pointer(&buf[uintptr(i)*size]))
		names = append(names, utf16Ptr(info.PrinterName))
	}
	return names, nil
}

func (winSpooler) DefaultPrinter() (string, error) {
	var size uint32
	procGetDefaultPrinter.Call(0, uintptr(unsafe.Pointer(&size)))
	if size == 0 {
		return "", nil
	}
	buf := make([]uint16, size)
	r, _, err := procGetDefaultPrinter.Call(uintptr(unsafe.Pointer(&buf[0])), uintptr(unsafe.Pointer(&size)))
	if r == 0 {
		return "", err
	}
	return syscall.UTF16ToString(buf), nil
}

func (winSpooler) PrintRaw(printer, doc string, data []byte) error {
	name, err := syscall.UTF16PtrFromString(printer)
	if err != nil {
		return err
	}
	var h syscall.Handle
	if r, _, e := procOpenPrinter.Call(uintptr(unsafe.Pointer(name)), uintptr(unsafe.Pointer(&h)), 0); r == 0 {
		return fmt.Errorf("no se pudo abrir: %v", e)
	}
	defer procClosePrinter.Call(uintptr(h))
	docName, _ := syscall.UTF16PtrFromString(doc)
	raw, _ := syscall.UTF16PtrFromString("RAW")
	info := docInfo1{DocName: docName, Datatype: raw}
	if r, _, e := procStartDocPrinter.Call(uintptr(h), 1, uintptr(unsafe.Pointer(&info))); r == 0 {
		return fmt.Errorf("no se pudo empezar: %v", e)
	}
	defer procEndDocPrinter.Call(uintptr(h))
	if r, _, e := procStartPagePrinter.Call(uintptr(h)); r == 0 {
		return fmt.Errorf("no se pudo empezar la página: %v", e)
	}
	var written uint32
	r, _, e := procWritePrinter.Call(uintptr(h), uintptr(unsafe.Pointer(&data[0])), uintptr(len(data)),
		uintptr(unsafe.Pointer(&written)))
	procEndPagePrinter.Call(uintptr(h))
	if r == 0 {
		return fmt.Errorf("no se pudo enviar: %v", e)
	}
	if int(written) != len(data) {
		return errors.New("la impresora recibió el trabajo incompleto")
	}
	return nil
}

func utf16Ptr(p *uint16) string {
	if p == nil {
		return ""
	}
	var chars []uint16
	for ptr := unsafe.Pointer(p); ; ptr = unsafe.Add(ptr, 2) {
		c := *(*uint16)(ptr)
		if c == 0 {
			break
		}
		chars = append(chars, c)
	}
	return syscall.UTF16ToString(chars)
}

// installDir: %LOCALAPPDATA%\XASKA (no pide permisos de administrador).
func installPath() string {
	base := os.Getenv("LOCALAPPDATA")
	if base == "" {
		base, _ = os.UserConfigDir()
	}
	return filepath.Join(base, "XASKA", exeName)
}

func installedHere() bool {
	self, err := os.Executable()
	return err == nil && strings.EqualFold(filepath.Clean(self), filepath.Clean(installPath()))
}

func hidden(name string, args ...string) error {
	cmd := exec.Command(name, args...)
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true, CreationFlags: createNoWindow}
	return cmd.Run()
}

// stopOthers: cierra otra copia que esté corriendo (para reemplazarla por la nueva versión).
func stopOthers() {
	_ = hidden("taskkill", "/F", "/IM", exeName, "/FI", "PID ne "+strconv.Itoa(os.Getpid()))
}

func installSelf() error {
	self, err := os.Executable()
	if err != nil {
		return err
	}
	dest := installPath()
	if err := os.MkdirAll(filepath.Dir(dest), 0o755); err != nil {
		return err
	}
	stopOthers()
	if !strings.EqualFold(filepath.Clean(self), filepath.Clean(dest)) {
		data, err := os.ReadFile(self)
		if err != nil {
			return err
		}
		if err := os.WriteFile(dest, data, 0o755); err != nil {
			return fmt.Errorf("no se pudo copiar a %s: %v", dest, err)
		}
	}
	if err := hidden("reg", "add", runKey, "/v", runValue, "/t", "REG_SZ", "/d", `"`+dest+`" -serve`, "/f"); err != nil {
		return fmt.Errorf("no se pudo dejar para arrancar con Windows: %v", err)
	}
	cmd := exec.Command(dest, "-serve")
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true, CreationFlags: createNoWindow}
	return cmd.Start()
}

func uninstallSelf() error {
	stopOthers()
	_ = hidden("reg", "delete", runKey, "/v", runValue, "/f")
	return errUninstalled
}

var errUninstalled = errors.New("uninstalled")

func notify(err error) {
	title, _ := syscall.UTF16PtrFromString("XASKA Impresora")
	var text string
	var icon uintptr = 0x40 // información
	switch {
	case err == nil:
		text = "XASKA Impresora quedó instalado y arranca solo con Windows.\n\nVuelve a XASKA → Ajustes → Impresora de este equipo y elige tu impresora."
	case errors.Is(err, errUninstalled):
		text = "XASKA Impresora ya no arranca con Windows. Puedes borrar la carpeta " + filepath.Dir(installPath()) + "."
	default:
		text = "No se pudo instalar XASKA Impresora:\n" + err.Error()
		icon = 0x10 // error
	}
	msg, _ := syscall.UTF16PtrFromString(text)
	procMessageBox.Call(0, uintptr(unsafe.Pointer(msg)), uintptr(unsafe.Pointer(title)), icon)
}

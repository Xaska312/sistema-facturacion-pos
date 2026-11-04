//go:build windows

package main

import (
	"errors"
	"fmt"
	"os"
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

var (
	advapi32           = syscall.NewLazyDLL("advapi32.dll")
	procRegOpenKeyEx   = advapi32.NewProc("RegOpenKeyExW")
	procRegSetValueEx  = advapi32.NewProc("RegSetValueExW")
	procRegQueryValue  = advapi32.NewProc("RegQueryValueExW")
	procRegDeleteValue = advapi32.NewProc("RegDeleteValueW")
	procRegCloseKey    = advapi32.NewProc("RegCloseKey")
)

const (
	hkeyCurrentUser = 0x80000001
	keyQueryValue   = 0x0001
	keySetValue     = 0x0002
	regSZ           = 1
	runKey          = `Software\Microsoft\Windows\CurrentVersion\Run`
	runValue        = "XASKA Impresora"
	mbOK            = 0x0
	mbYesNo         = 0x4
	mbIconInfo      = 0x40
	mbIconError     = 0x10
	mbIconQuestion  = 0x20
	idYes           = 6
)

func openRun(access uintptr) (syscall.Handle, error) {
	key, _ := syscall.UTF16PtrFromString(runKey)
	var h syscall.Handle
	if r, _, _ := procRegOpenKeyEx.Call(hkeyCurrentUser, uintptr(unsafe.Pointer(key)), 0, access,
		uintptr(unsafe.Pointer(&h))); r != 0 {
		return 0, syscall.Errno(r)
	}
	return h, nil
}

// autostartCommand: lo que arranca con Windows (este mismo archivo, sin preguntas).
func autostartCommand() (string, error) {
	self, err := os.Executable()
	if err != nil {
		return "", err
	}
	return `"` + self + `" -serve`, nil
}

func autostartIsSet() bool {
	h, err := openRun(keyQueryValue)
	if err != nil {
		return false
	}
	defer procRegCloseKey.Call(uintptr(h))
	name, _ := syscall.UTF16PtrFromString(runValue)
	buf := make([]uint16, 1024)
	size := uint32(len(buf) * 2)
	if r, _, _ := procRegQueryValue.Call(uintptr(h), uintptr(unsafe.Pointer(name)), 0, 0,
		uintptr(unsafe.Pointer(&buf[0])), uintptr(unsafe.Pointer(&size))); r != 0 {
		return false
	}
	want, err := autostartCommand()
	return err == nil && strings.EqualFold(syscall.UTF16ToString(buf), want)
}

// setAutostart: pone o quita la entrada "Run" del usuario (sin reg.exe ni permisos de administrador).
func setAutostart(on bool) error {
	h, err := openRun(keySetValue)
	if err != nil {
		return err
	}
	defer procRegCloseKey.Call(uintptr(h))
	name, _ := syscall.UTF16PtrFromString(runValue)
	if !on {
		procRegDeleteValue.Call(uintptr(h), uintptr(unsafe.Pointer(name)))
		return nil
	}
	cmd, err := autostartCommand()
	if err != nil {
		return err
	}
	data, _ := syscall.UTF16FromString(cmd)
	if r, _, _ := procRegSetValueEx.Call(uintptr(h), uintptr(unsafe.Pointer(name)), 0, regSZ,
		uintptr(unsafe.Pointer(&data[0])), uintptr(len(data)*2)); r != 0 {
		return syscall.Errno(r)
	}
	return nil
}

func messageBox(text string, flags uintptr) int {
	title, _ := syscall.UTF16PtrFromString("XASKA Impresora")
	msg, _ := syscall.UTF16PtrFromString(text)
	r, _, _ := procMessageBox.Call(0, uintptr(unsafe.Pointer(msg)), uintptr(unsafe.Pointer(title)), flags)
	return int(r)
}

// welcome: al abrirlo con doble clic. Pregunta una sola vez si arranca con Windows.
func welcome() {
	if autostartIsSet() {
		messageBox("XASKA Impresora está funcionando.\n\nVuelve a XASKA → Ajustes → Impresora de este equipo.", mbOK|mbIconInfo)
		return
	}
	answer := messageBox("XASKA Impresora está funcionando. Vuelve a XASKA → Ajustes → Impresora de este equipo.\n\n"+
		"¿Quieres que arranque solo cada vez que prendas este computador?\n\n"+
		"(Antes de decir que sí, guarda este archivo en una carpeta fija, por ejemplo Documentos: el arranque lo busca ahí.)",
		mbYesNo|mbIconQuestion)
	if answer == idYes {
		info(setAutostart(true), "Listo: XASKA Impresora arrancará solo con Windows.")
	}
}

func info(err error, ok string) {
	if err != nil {
		messageBox("No se pudo: "+err.Error(), mbOK|mbIconError)
		return
	}
	messageBox(ok, mbOK|mbIconInfo)
}

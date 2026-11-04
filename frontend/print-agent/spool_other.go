//go:build !windows

package main

import "errors"

// Fuera de Windows no hay cola de impresión: el programa es solo para la caja con Windows.
type noSpooler struct{}

func (noSpooler) Printers() ([]string, error)     { return nil, nil }
func (noSpooler) DefaultPrinter() (string, error) { return "", nil }
func (noSpooler) PrintRaw(string, string, []byte) error {
	return errors.New("solo funciona en Windows")
}

func systemSpooler() Spooler { return noSpooler{} }

func setAutostart(bool) error { return errors.New("solo funciona en Windows") }
func welcome()                {}
func info(error, string)      {}

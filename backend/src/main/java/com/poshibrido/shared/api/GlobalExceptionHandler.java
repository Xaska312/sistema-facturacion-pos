package com.poshibrido.shared.api;

import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.servlet.resource.NoResourceFoundException;

import java.net.URI;
import java.time.Instant;
import java.util.stream.Collectors;

@RestControllerAdvice
public class GlobalExceptionHandler {

    @ExceptionHandler(Exception.class)
    public ProblemDetail handleAllExceptions(Exception ex) {
        ProblemDetail problemDetail = ProblemDetail.forStatusAndDetail(HttpStatus.INTERNAL_SERVER_ERROR, "Ha ocurrido un error interno en el servidor.");
        problemDetail.setTitle("Error Interno");
        problemDetail.setType(URI.create("https://api.poshibrido.com/errors/internal-error"));
        problemDetail.setProperty("timestamp", Instant.now());
        // Nunca exponemos ex.getMessage() al cliente para errores 500
        return problemDetail;
    }

    @ExceptionHandler(NoResourceFoundException.class)
    public ProblemDetail handleNotFound(NoResourceFoundException ex) {
        ProblemDetail problemDetail = ProblemDetail.forStatusAndDetail(HttpStatus.NOT_FOUND, "El recurso solicitado no existe.");
        problemDetail.setTitle("No Encontrado");
        problemDetail.setType(URI.create("https://api.poshibrido.com/errors/not-found"));
        problemDetail.setProperty("timestamp", Instant.now());
        return problemDetail;
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ProblemDetail handleValidationExceptions(MethodArgumentNotValidException ex) {
        String validationErrors = ex.getBindingResult().getFieldErrors().stream()
                .map(error -> error.getField() + ": " + error.getDefaultMessage())
                .collect(Collectors.joining("; "));
        
        ProblemDetail problemDetail = ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST, "Error de validación en los datos enviados.");
        problemDetail.setTitle("Petición Inválida");
        problemDetail.setType(URI.create("https://api.poshibrido.com/errors/bad-request"));
        problemDetail.setProperty("timestamp", Instant.now());
        problemDetail.setProperty("errores", validationErrors);
        return problemDetail;
    }
}
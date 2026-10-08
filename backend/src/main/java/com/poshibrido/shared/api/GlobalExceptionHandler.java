package com.poshibrido.shared.api;

import com.poshibrido.shared.error.DomainException;
import lombok.extern.slf4j.Slf4j;
import jakarta.persistence.OptimisticLockException;
import jakarta.persistence.PersistenceException;
import jakarta.persistence.PessimisticLockException;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.dao.QueryTimeoutException;
import org.springframework.jdbc.CannotGetJdbcConnectionException;
import org.springframework.transaction.CannotCreateTransactionException;
import org.springframework.transaction.TransactionTimedOutException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.orm.ObjectOptimisticLockingFailureException;
import org.springframework.dao.ConcurrencyFailureException;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.AuthenticationException;
import org.springframework.web.HttpMediaTypeNotSupportedException;
import org.springframework.web.HttpRequestMethodNotSupportedException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.multipart.MaxUploadSizeExceededException;
import org.springframework.web.multipart.MultipartException;
import org.springframework.web.multipart.support.MissingServletRequestPartException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.servlet.resource.NoResourceFoundException;

import java.net.URI;
import java.sql.SQLException;
import java.time.Instant;
import java.util.List;
import java.util.Map;

/**
 * Único punto de traducción de errores a ProblemDetail (RFC 9457).
 * Nunca se envía al cliente el mensaje interno de una excepción técnica.
 */
@Slf4j
@RestControllerAdvice
public class GlobalExceptionHandler {

    private static final String TYPE_BASE = "https://api.poshibrido.com/errors/";

    @ExceptionHandler(DomainException.class)
    public ResponseEntity<ProblemDetail> handleDomain(DomainException ex) {
        ResponseEntity<ProblemDetail> response = build(ex.getStatus(), ex.getTitle(), ex.getMessage());
        ex.getProperties().forEach(response.getBody()::setProperty);
        return response;
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ProblemDetail> handleValidation(MethodArgumentNotValidException ex) {
        List<Map<String, String>> errors = ex.getBindingResult().getFieldErrors().stream()
                .map(error -> Map.of(
                        "field", error.getField(),
                        "message", error.getDefaultMessage() == null ? "Valor inválido" : error.getDefaultMessage()))
                .toList();
        ResponseEntity<ProblemDetail> response =
                build(HttpStatus.BAD_REQUEST, "Petición inválida", "Error de validación en los datos enviados.");
        response.getBody().setProperty("errors", errors);
        return response;
    }

    @ExceptionHandler({HttpMessageNotReadableException.class, MethodArgumentTypeMismatchException.class,
            MissingServletRequestParameterException.class})
    public ResponseEntity<ProblemDetail> handleBadRequest(Exception ex) {
        return build(HttpStatus.BAD_REQUEST, "Petición inválida", "La petición no tiene un formato válido.");
    }

    @ExceptionHandler(MaxUploadSizeExceededException.class)
    public ResponseEntity<ProblemDetail> handleUploadSize(MaxUploadSizeExceededException ex) {
        return build(HttpStatus.PAYLOAD_TOO_LARGE, "Archivo demasiado grande", "El archivo supera el tamaño permitido (5 MB).");
    }

    @ExceptionHandler({MissingServletRequestPartException.class, MultipartException.class})
    public ResponseEntity<ProblemDetail> handleMultipart(Exception ex) {
        return build(HttpStatus.BAD_REQUEST, "Petición inválida", "Adjunta el archivo en el campo 'file'.");
    }

    @ExceptionHandler(AuthenticationException.class)
    public ResponseEntity<ProblemDetail> handleAuthentication(AuthenticationException ex) {
        return build(HttpStatus.UNAUTHORIZED, "No autenticado", "Debes iniciar sesión para continuar.");
    }

    @ExceptionHandler(AccessDeniedException.class)
    public ResponseEntity<ProblemDetail> handleAccessDenied(AccessDeniedException ex) {
        return build(HttpStatus.FORBIDDEN, "Acceso denegado", "No tienes permiso para realizar esta acción.");
    }

    @ExceptionHandler(NoResourceFoundException.class)
    public ResponseEntity<ProblemDetail> handleNoResource(NoResourceFoundException ex) {
        return build(HttpStatus.NOT_FOUND, "No encontrado", "El recurso solicitado no existe.");
    }

    @ExceptionHandler(HttpRequestMethodNotSupportedException.class)
    public ResponseEntity<ProblemDetail> handleMethod(HttpRequestMethodNotSupportedException ex) {
        return build(HttpStatus.METHOD_NOT_ALLOWED, "Método no permitido", "Método HTTP no soportado para este recurso.");
    }

    @ExceptionHandler(HttpMediaTypeNotSupportedException.class)
    public ResponseEntity<ProblemDetail> handleMediaType(HttpMediaTypeNotSupportedException ex) {
        return build(HttpStatus.UNSUPPORTED_MEDIA_TYPE, "Tipo de contenido no soportado", "Usa application/json.");
    }

    @ExceptionHandler(ObjectOptimisticLockingFailureException.class)
    public ResponseEntity<ProblemDetail> handleOptimisticLock(ObjectOptimisticLockingFailureException ex) {
        return build(HttpStatus.CONFLICT, "Conflicto",
                "El registro fue modificado por otro usuario. Recarga e intenta de nuevo.");
    }

    /** Interbloqueo o espera de bloqueo agotada entre operaciones simultáneas: se puede reintentar. */
    @ExceptionHandler(ConcurrencyFailureException.class)
    public ResponseEntity<ProblemDetail> handleConcurrency(ConcurrencyFailureException ex) {
        log.warn("Conflicto de concurrencia: {}", ex.getMostSpecificCause().getMessage());
        return build(HttpStatus.CONFLICT, "Conflicto",
                "Otra operación modificó los mismos datos al mismo tiempo. Intenta de nuevo.");
    }

    /** Sin conexión libre en el pool (muchas operaciones a la vez): 503 para reintentar, no 500 (QA INV-6). */
    @ExceptionHandler({CannotCreateTransactionException.class, CannotGetJdbcConnectionException.class})
    public ResponseEntity<ProblemDetail> handleNoConnection(Exception ex) {
        log.warn("Sin conexión a la base disponible: {}", ex.getMessage());
        return retryLater("El sistema está ocupado en este momento. Inténtalo de nuevo en unos segundos.");
    }

    /** Consulta o transacción que superó su tiempo máximo (reportes con periodos muy grandes). */
    @ExceptionHandler({QueryTimeoutException.class, TransactionTimedOutException.class})
    public ResponseEntity<ProblemDetail> handleTimeout(Exception ex) {
        log.warn("Tiempo máximo superado: {}", ex.getMessage());
        return retryLater("La consulta tardó demasiado. Acota el periodo o inténtalo de nuevo en un momento.");
    }

    /**
     * Errores de la base que llegan sin traducir (p. ej. un {@code flush} fuera de un repositorio): se clasifican
     * por su SQLState en vez de responder 500 (QA INV-8).
     */
    @ExceptionHandler(PersistenceException.class)
    public ResponseEntity<ProblemDetail> handlePersistence(PersistenceException ex) {
        // Consultas en servicios (reportes, auditoría) llegan sin traducir a excepciones de Spring: 57014 es la
        // consulta cancelada por el tiempo máximo de la transacción.
        if (ex instanceof jakarta.persistence.QueryTimeoutException || "57014".equals(sqlState(ex))) {
            return retryLater("La consulta tardó demasiado. Prueba con un periodo más corto o inténtalo en un momento.");
        }
        if (ex instanceof OptimisticLockException || ex instanceof PessimisticLockException) {
            return build(HttpStatus.CONFLICT, "Conflicto",
                    "Otra operación estaba usando los mismos datos. Inténtalo de nuevo.");
        }
        String state = sqlState(ex);
        if (state != null && state.startsWith("23")) {
            return build(HttpStatus.CONFLICT, "Conflicto", "La operación entra en conflicto con datos existentes.");
        }
        if (state != null && state.startsWith("22")) {
            return build(HttpStatus.UNPROCESSABLE_CONTENT, "Valor fuera de rango",
                    "Algún valor es demasiado grande o no es válido. Revisa cantidades y precios.");
        }
        if ("40001".equals(state) || "40P01".equals(state) || "55P03".equals(state)) {
            return build(HttpStatus.CONFLICT, "Conflicto",
                    "Otra operación estaba usando los mismos datos. Inténtalo de nuevo.");
        }
        log.error("Error de persistencia no controlado (SQLState {})", state, ex);
        return build(HttpStatus.INTERNAL_SERVER_ERROR, "Error interno", "Ha ocurrido un error interno en el servidor.");
    }

    private static String sqlState(Throwable ex) {
        for (Throwable t = ex; t != null; t = t.getCause()) {
            if (t instanceof SQLException sql && sql.getSQLState() != null) {
                return sql.getSQLState();
            }
        }
        return null;
    }

    private static ResponseEntity<ProblemDetail> retryLater(String detail) {
        ProblemDetail body = build(HttpStatus.SERVICE_UNAVAILABLE, "Servicio ocupado", detail).getBody();
        return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE).header("Retry-After", "5").body(body);
    }

    @ExceptionHandler(DataIntegrityViolationException.class)
    public ResponseEntity<ProblemDetail> handleIntegrity(DataIntegrityViolationException ex) {
        log.warn("Violación de integridad de datos: {}", ex.getMostSpecificCause().getMessage());
        return build(HttpStatus.CONFLICT, "Conflicto", "La operación entra en conflicto con datos existentes.");
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<ProblemDetail> handleUnexpected(Exception ex) {
        log.error("Error no controlado", ex);
        return build(HttpStatus.INTERNAL_SERVER_ERROR, "Error interno", "Ha ocurrido un error interno en el servidor.");
    }

    private static ResponseEntity<ProblemDetail> build(HttpStatus status, String title, String detail) {
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(status, detail);
        problem.setTitle(title);
        problem.setType(URI.create(TYPE_BASE + status.value()));
        problem.setProperty("timestamp", Instant.now().toString());
        return ResponseEntity.status(status).body(problem);
    }
}

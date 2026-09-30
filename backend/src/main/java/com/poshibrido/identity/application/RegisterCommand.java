package com.poshibrido.identity.application;

public record RegisterCommand(String email, String password, String fullName, String phone) {
}

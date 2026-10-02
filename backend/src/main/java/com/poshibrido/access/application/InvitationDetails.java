package com.poshibrido.access.application;

import com.poshibrido.identity.domain.InvitationStatus;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

/** Invitación vista desde el negocio, con nombres de roles, sucursales y de quien invitó. */
public record InvitationDetails(UUID id, String email, InvitationStatus status, boolean expired, Instant expiresAt,
                                Instant createdAt, String invitedByName, List<MemberView.RoleRef> roles,
                                List<MemberView.BranchRefView> branches) {
}

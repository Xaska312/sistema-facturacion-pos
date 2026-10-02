package com.poshibrido.access.application;

import com.poshibrido.access.domain.Role;
import com.poshibrido.access.infrastructure.MemberRepository;
import com.poshibrido.access.infrastructure.RoleRepository;
import com.poshibrido.audit.application.AuditLogger;
import com.poshibrido.identity.application.InvitationApi;
import com.poshibrido.identity.application.InvitationView;
import com.poshibrido.identity.application.MembershipApi;
import com.poshibrido.identity.application.UserApi;
import com.poshibrido.identity.application.UserSummary;
import com.poshibrido.organization.application.BranchApi;
import com.poshibrido.organization.application.BranchApi.BranchRef;
import com.poshibrido.shared.error.BusinessRuleException;
import com.poshibrido.shared.error.ConflictException;
import com.poshibrido.shared.security.CurrentActor;
import com.poshibrido.tenancy.application.CurrentTenant;
import com.poshibrido.tenancy.application.TenantRef;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Comparator;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.TreeSet;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * Invitaciones del negocio actual: crear (devuelve el token una sola vez), listar y revocar.
 * El envío del enlace es manual (WhatsApp, correo); el envío automático llega en Fase 7.
 */
@Service
@RequiredArgsConstructor
public class MemberInvitationService {

    private final InvitationApi invitations;
    private final RoleService roleService;
    private final RoleRepository roles;
    private final MemberRepository members;
    private final BranchApi branches;
    private final UserApi users;
    private final MembershipApi memberships;
    private final PrivilegeGuard guard;
    private final AuditLogger audit;

    public record Created(InvitationDetails invitation, String token) {
    }

    @Transactional
    public Created invite(String email, Set<UUID> roleIds, Set<UUID> branchIds) {
        TenantRef tenant = CurrentTenant.require();
        if (roleIds == null || roleIds.isEmpty()) {
            throw new BusinessRuleException("Asigna al menos un rol.");
        }
        List<Role> assigned = roleService.requireAll(roleIds);
        guard.requireCanAssign(assigned);
        requireActiveBranches(branchIds);

        Optional<UserSummary> existing = users.findByEmail(email);
        if (existing.isPresent() && memberships.isActiveMember(existing.get().id(), tenant.id())
                && members.findById(existing.get().id()).map(m -> m.isActive()).orElse(false)) {
            throw new ConflictException("Esa persona ya es miembro activo del negocio.");
        }

        InvitationApi.Created created = invitations.create(tenant.id(), email, roleIds, branchIds,
                CurrentActor.requireUserId());
        Map<String, Object> after = new LinkedHashMap<>();
        after.put("email", created.invitation().email());
        after.put("roles", new TreeSet<>(roleIds));
        after.put("branches", new TreeSet<>(branchIds));
        audit.log("INVITATION_CREATED", "invitation", created.invitation().id(), null, after);
        return new Created(toDetails(List.of(created.invitation())).getFirst(), created.rawToken());
    }

    @Transactional(readOnly = true)
    public Page<InvitationDetails> list(boolean onlyPending, Pageable pageable) {
        Page<InvitationView> page = invitations.listForTenant(CurrentTenant.require().id(), onlyPending, pageable);
        List<InvitationDetails> details = toDetails(page.getContent());
        Map<UUID, InvitationDetails> byId = details.stream()
                .collect(Collectors.toMap(InvitationDetails::id, Function.identity()));
        return page.map(v -> byId.get(v.id()));
    }

    @Transactional
    public InvitationDetails revoke(UUID invitationId) {
        InvitationView revoked = invitations.revoke(CurrentTenant.require().id(), invitationId);
        audit.log("INVITATION_REVOKED", "invitation", invitationId, null, Map.of("email", revoked.email()));
        return toDetails(List.of(revoked)).getFirst();
    }

    private void requireActiveBranches(Set<UUID> ids) {
        if (ids == null || ids.isEmpty()) {
            throw new BusinessRuleException("Asigna al menos una sucursal.");
        }
        List<BranchRef> found = branches.findByIds(ids);
        if (found.size() != new HashSet<>(ids).size() || found.stream().anyMatch(b -> !b.active())) {
            throw new BusinessRuleException("Alguna de las sucursales no existe o está inactiva.");
        }
    }

    private List<InvitationDetails> toDetails(List<InvitationView> list) {
        if (list.isEmpty()) {
            return List.of();
        }
        Map<UUID, UserSummary> inviters = users.findSummaries(
                list.stream().map(InvitationView::invitedBy).collect(Collectors.toSet()));
        Map<UUID, Role> roleById = roles.findAllById(
                list.stream().flatMap(v -> v.roleIds().stream()).collect(Collectors.toSet())).stream()
                .collect(Collectors.toMap(Role::getId, Function.identity()));
        Map<UUID, BranchRef> branchById = branches.findByIds(
                list.stream().flatMap(v -> v.branchIds().stream()).collect(Collectors.toSet())).stream()
                .collect(Collectors.toMap(BranchRef::id, Function.identity()));

        return list.stream().map(v -> new InvitationDetails(
                v.id(), v.email(), v.status(), v.expired(), v.expiresAt(), v.createdAt(),
                inviters.containsKey(v.invitedBy()) ? inviters.get(v.invitedBy()).fullName() : null,
                v.roleIds().stream().map(roleById::get).filter(r -> r != null)
                        .map(r -> new MemberView.RoleRef(r.getId(), r.getCode(), r.getName()))
                        .sorted(Comparator.comparing(MemberView.RoleRef::name)).toList(),
                v.branchIds().stream().map(branchById::get).filter(b -> b != null)
                        .map(b -> new MemberView.BranchRefView(b.id(), b.code(), b.name()))
                        .sorted(Comparator.comparing(MemberView.BranchRefView::code)).toList()))
                .toList();
    }
}

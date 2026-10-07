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
import com.poshibrido.mail.MailTemplates;
import com.poshibrido.mail.Mailer;
import com.poshibrido.organization.application.BranchApi;
import com.poshibrido.organization.application.BranchApi.BranchRef;
import com.poshibrido.shared.error.BusinessRuleException;
import com.poshibrido.shared.error.ConflictException;
import com.poshibrido.shared.security.CurrentActor;
import com.poshibrido.tenancy.application.CurrentTenant;
import com.poshibrido.tenancy.application.TenantApi;
import com.poshibrido.tenancy.application.TenantInfo;
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
 * Invitaciones del negocio actual: crear (devuelve el token una sola vez), reenviar, listar y revocar.
 * El enlace se envía por correo al invitado (después de guardar) y además se devuelve para compartirlo a mano.
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
    private final TenantApi tenants;
    private final Mailer mailer;
    private final MailTemplates templates;

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
        sendInvitation(tenant, created, assigned);
        return new Created(toDetails(List.of(created.invitation())).getFirst(), created.rawToken());
    }

    /**
     * Reenvía una invitación pendiente: genera un enlace nuevo (el anterior deja de servir), lo envía por correo y
     * lo devuelve para compartirlo. Quien reenvía debe poder asignar esos roles.
     */
    @Transactional
    public Created resend(UUID invitationId) {
        TenantRef tenant = CurrentTenant.require();
        InvitationApi.Created created = invitations.reissue(tenant.id(), invitationId, CurrentActor.requireUserId());
        List<Role> assigned = roleService.requireAll(created.invitation().roleIds());
        guard.requireCanAssign(assigned);
        audit.log("INVITATION_RESENT", "invitation", created.invitation().id(), null,
                Map.of("email", created.invitation().email(), "previousId", invitationId));
        sendInvitation(tenant, created, assigned);
        return new Created(toDetails(List.of(created.invitation())).getFirst(), created.rawToken());
    }

    private void sendInvitation(TenantRef tenant, InvitationApi.Created created, List<Role> roles) {
        String businessName = tenants.findInfo(tenant.id()).map(TenantInfo::tradeName).orElse(tenant.slug());
        UUID inviterId = CurrentActor.requireUserId();
        UserSummary inviter = users.findSummaries(Set.of(inviterId)).get(inviterId);
        List<String> roleNames = roles.stream().map(Role::getName).sorted().toList();
        mailer.send(templates.invitation(created.invitation().email(), inviter == null ? null : inviter.fullName(),
                businessName, roleNames, created.rawToken(), created.invitation().expiresAt()));
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

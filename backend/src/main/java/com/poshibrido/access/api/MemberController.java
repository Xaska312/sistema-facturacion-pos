package com.poshibrido.access.api;

import com.poshibrido.access.application.InvitationDetails;
import com.poshibrido.access.application.MemberInvitationService;
import com.poshibrido.access.application.MemberService;
import com.poshibrido.access.application.MemberView;
import com.poshibrido.shared.api.PageRequests;
import com.poshibrido.shared.api.PageResponse;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Sort;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.Set;
import java.util.UUID;

@RestController
@RequiredArgsConstructor
@RequestMapping("/api/v1/members")
public class MemberController {

    private static final Set<String> MEMBER_SORT = Set.of("displayName", "createdAt");
    private static final Set<String> INVITATION_SORT = Set.of("createdAt", "email", "expiresAt");

    private final MemberService members;
    private final MemberInvitationService invitations;

    public record UpdateMemberRequest(@NotEmpty Set<@NotNull UUID> roleIds,
                                      @NotEmpty Set<@NotNull UUID> branchIds,
                                      UUID defaultBranchId) {
    }

    public record InviteRequest(@NotBlank @Email @Size(max = 255) String email,
                                @NotEmpty Set<@NotNull UUID> roleIds,
                                @NotEmpty Set<@NotNull UUID> branchIds) {
    }

    /** El token solo se entrega aquí, una vez; el frontend arma el enlace con él. */
    public record InvitationCreatedResponse(InvitationDetails invitation, String token) {
    }

    @GetMapping
    @PreAuthorize("hasAuthority('members:read')")
    public PageResponse<MemberView> list(@RequestParam(required = false) String search,
                                         @RequestParam(defaultValue = "0") int page,
                                         @RequestParam(defaultValue = "20") int size,
                                         @RequestParam(required = false) String sort) {
        return PageResponse.of(members.list(search,
                PageRequests.of(page, size, sort, MEMBER_SORT, Sort.by("displayName"))), m -> m);
    }

    @GetMapping("/{id}")
    @PreAuthorize("hasAuthority('members:read')")
    public MemberView get(@PathVariable UUID id) {
        return members.get(id);
    }

    @PutMapping("/{id}")
    @PreAuthorize("hasAuthority('members:manage')")
    public MemberView update(@PathVariable UUID id, @Valid @RequestBody UpdateMemberRequest request) {
        return members.update(id, request.roleIds(), request.branchIds(), request.defaultBranchId());
    }

    @PostMapping("/{id}/deactivate")
    @PreAuthorize("hasAuthority('members:manage')")
    public MemberView deactivate(@PathVariable UUID id) {
        return members.setActive(id, false);
    }

    @PostMapping("/{id}/activate")
    @PreAuthorize("hasAuthority('members:manage')")
    public MemberView activate(@PathVariable UUID id) {
        return members.setActive(id, true);
    }

    @GetMapping("/invitations")
    @PreAuthorize("hasAuthority('members:read')")
    public PageResponse<InvitationDetails> invitations(@RequestParam(defaultValue = "true") boolean pending,
                                                       @RequestParam(defaultValue = "0") int page,
                                                       @RequestParam(defaultValue = "20") int size,
                                                       @RequestParam(required = false) String sort) {
        return PageResponse.of(invitations.list(pending,
                PageRequests.of(page, size, sort, INVITATION_SORT, Sort.by(Sort.Direction.DESC, "createdAt"))), i -> i);
    }

    @PostMapping("/invitations")
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("hasAuthority('members:manage')")
    public InvitationCreatedResponse invite(@Valid @RequestBody InviteRequest request) {
        MemberInvitationService.Created created = invitations.invite(request.email(), request.roleIds(),
                request.branchIds());
        return new InvitationCreatedResponse(created.invitation(), created.token());
    }

    /** Reenvía el correo con un enlace nuevo (el anterior deja de servir). */
    @PostMapping("/invitations/{id}/resend")
    @PreAuthorize("hasAuthority('members:manage')")
    public InvitationCreatedResponse resend(@PathVariable UUID id) {
        MemberInvitationService.Created created = invitations.resend(id);
        return new InvitationCreatedResponse(created.invitation(), created.token());
    }

    @PostMapping("/invitations/{id}/revoke")
    @PreAuthorize("hasAuthority('members:manage')")
    public InvitationDetails revoke(@PathVariable UUID id) {
        return invitations.revoke(id);
    }
}

package com.poshibrido.access.application;

import com.poshibrido.access.domain.Member;
import com.poshibrido.access.infrastructure.MemberRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Collection;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

/** Nombres de los miembros del negocio actual (para mostrar responsables en documentos). */
@Service
@RequiredArgsConstructor
public class MemberDirectory {

    private final MemberRepository members;

    @Transactional(readOnly = true)
    public Map<UUID, String> displayNames(Collection<UUID> ids) {
        if (ids.isEmpty()) {
            return Map.of();
        }
        return members.findAllById(ids.stream().filter(Objects::nonNull).collect(Collectors.toSet())).stream()
                .collect(Collectors.toMap(Member::getId, Member::getDisplayName));
    }

    /** Sucursales asignadas al miembro (vacío si no es miembro del negocio). */
    @Transactional(readOnly = true)
    public Set<UUID> branchIdsOf(UUID memberId) {
        return members.findById(memberId).map(m -> Set.copyOf(m.getBranchIds())).orElse(Set.of());
    }
}

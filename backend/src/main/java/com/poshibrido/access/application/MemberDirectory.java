package com.poshibrido.access.application;

import com.poshibrido.access.domain.Member;
import com.poshibrido.access.infrastructure.MemberRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Collection;
import java.util.HashMap;
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

    /**
     * Nombre por id de miembro. Devuelve siempre un mapa que acepta {@code get(null)} (los mapas inmutables de
     * {@code Map.of()} lanzan NullPointerException con una clave nula).
     */
    @Transactional(readOnly = true)
    public Map<UUID, String> displayNames(Collection<UUID> ids) {
        Set<UUID> wanted = ids.stream().filter(Objects::nonNull).collect(Collectors.toSet());
        Map<UUID, String> names = new HashMap<>();
        if (!wanted.isEmpty()) {
            members.findAllById(wanted).forEach(m -> names.put(m.getId(), m.getDisplayName()));
        }
        return names;
    }

    /** Sucursales asignadas al miembro (vacío si no es miembro del negocio). */
    @Transactional(readOnly = true)
    public Set<UUID> branchIdsOf(UUID memberId) {
        return members.findById(memberId).map(m -> Set.copyOf(m.getBranchIds())).orElse(Set.of());
    }
}

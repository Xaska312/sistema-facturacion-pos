package com.poshibrido.access.infrastructure;

import com.poshibrido.access.domain.Member;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.UUID;

public interface MemberRepository extends JpaRepository<Member, UUID> {

    @Query("select count(m) from Member m join m.roleIds r where r = :roleId")
    long countWithRole(@Param("roleId") UUID roleId);

    @Query("select r, count(m) from Member m join m.roleIds r group by r")
    List<Object[]> countByRole();

    Page<Member> findByDisplayNameContainingIgnoreCase(String search, Pageable pageable);
}

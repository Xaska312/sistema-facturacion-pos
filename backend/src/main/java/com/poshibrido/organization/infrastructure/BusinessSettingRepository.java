package com.poshibrido.organization.infrastructure;

import com.poshibrido.organization.domain.BusinessSetting;
import org.springframework.data.jpa.repository.JpaRepository;

public interface BusinessSettingRepository extends JpaRepository<BusinessSetting, String> {
}

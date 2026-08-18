function optionalText(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function serializeRegistrationAttribution(row) {
  const utmSource = optionalText(row.utm_source);
  const utmMedium = optionalText(row.utm_medium);
  const utmCampaign = optionalText(row.utm_campaign);
  const referrerHost = optionalText(row.referrer_host);
  const hasAcquisition = row.acquisition_event_id != null;
  const hasAbTest = Boolean(
    optionalText(row.experiment_key)
    && ["A", "B"].includes(row.experiment_variant),
  );

  return {
    linked: row.registration_event_id != null,
    recordedAt: row.attribution_recorded_at || null,
    acquisition: hasAcquisition
      ? {
          source: utmSource || referrerHost || "직접 방문",
          utmSource,
          utmMedium,
          utmCampaign,
          referrerHost,
        }
      : null,
    abTest: hasAbTest
      ? {
          key: row.experiment_key,
          variant: row.experiment_variant,
          assignmentMethod: optionalText(row.assignment_method),
        }
      : null,
  };
}

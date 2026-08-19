-- Seed data: Advertiser Inventory & Rate Card
-- 4 daypart rows for ch-01. Guarded against additive re-execution.

INSERT INTO ghostslate.advertiser_inventory (channel_id, daypart, cpm_usd, fill_target_pct)
SELECT channel_id, daypart, cpm_usd, fill_target_pct
FROM (
    SELECT 'ch-01' AS channel_id, 'primetime' AS daypart, toDecimal64(32.50, 2) AS cpm_usd, toFloat32(95.0) AS fill_target_pct
    UNION ALL SELECT 'ch-01', 'daytime', toDecimal64(18.75, 2), toFloat32(92.0)
    UNION ALL SELECT 'ch-01', 'late_night', toDecimal64(9.25, 2), toFloat32(85.0)
    UNION ALL SELECT 'ch-01', 'early_morning', toDecimal64(6.40, 2), toFloat32(80.0)
)
WHERE (SELECT count() FROM ghostslate.advertiser_inventory) = 0;

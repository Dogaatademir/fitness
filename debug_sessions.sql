-- Mevcut session'ları göster
SELECT ws.id, ws.date, ws.started_at, ws.ended_at, pd.day_name, pd.order_index
FROM workout_sessions ws
LEFT JOIN program_days pd ON pd.id = ws.program_day_id
ORDER BY ws.started_at DESC
LIMIT 10;

-- Include client_id in the compression ordering so the (client_id, time) uniqueness check
-- stays fast when late offline pings land in compressed chunks.
ALTER TABLE pings SET (timescaledb.compress_orderby = 'time, client_id');

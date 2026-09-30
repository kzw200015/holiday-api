-- 节假日安排：一天一行。
--
-- 已经部署过的库上有 TypeScript 版留下的 holiday_days（date 存 YYYY-MM-DD 文本，另有 id、created_at、updated_at 三列）
-- 与 drizzle 的迁移登记：表原地转成新的形状、保留已有的数据，登记整个删掉。空库上直接建出新表。
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema() AND table_name = 'holiday_days' AND column_name = 'id'
  ) THEN
    ALTER TABLE holiday_days DROP COLUMN id, DROP COLUMN created_at, DROP COLUMN updated_at;
    ALTER TABLE holiday_days ALTER COLUMN date TYPE date USING date::date;
    DROP INDEX holiday_days_date_key;
    ALTER TABLE holiday_days ADD PRIMARY KEY (date);
  ELSE
    CREATE TABLE holiday_days (
      date date PRIMARY KEY,
      is_off_day boolean NOT NULL,
      name text NOT NULL
    );
  END IF;
END
$$;

DROP SCHEMA IF EXISTS drizzle CASCADE;

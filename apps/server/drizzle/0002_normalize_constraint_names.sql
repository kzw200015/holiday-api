-- 有的库是早期用别的工具建的，外键与非空约束的名字和基线里的不一样（语义相同）。统一改成基线里的名字，
-- 之后生成的迁移按名字删改约束时才对得上。只改名、不动定义；已经是这些名字的库什么也不做。
DO $$
DECLARE
    renames CONSTANT text[][] := ARRAY[
        ['eh_credentials', 'eh_credentials_user_id_users_id_fk', 'eh_credentials_user_id_fkey'],
        ['eh_reading_progress', 'eh_reading_progress_user_id_users_id_fk', 'eh_reading_progress_user_id_fkey'],
        ['eh_preferences', 'eh_preferences_user_id_users_id_fk', 'eh_preferences_user_id_fkey'],
        ['eh_credentials', 'eh_credentials_cookie_encrypted_not_null', 'eh_credentials_cookie_not_null']
    ];
    item text[];
BEGIN
    FOREACH item SLICE 1 IN ARRAY renames LOOP
        IF EXISTS (
            SELECT 1 FROM pg_constraint
            WHERE conrelid = format('public.%I', item[1])::regclass AND conname = item[2]
        ) THEN
            EXECUTE format('ALTER TABLE public.%I RENAME CONSTRAINT %I TO %I', item[1], item[2], item[3]);
        END IF;
    END LOOP;
END
$$;

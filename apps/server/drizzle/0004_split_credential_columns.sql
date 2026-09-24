-- e 站凭据从一列 JSON 文本拆成一项一列。member_id 本来就是 ipb_member_id 的值（绑定时两处写的是同一个），直接改名。
-- 另两项从旧 JSON 里取，缺了按空串算，与之前的读法一致。旧数据要是有不是合法 JSON 的行，::jsonb 会报错、
-- 整批迁移回滚、服务拒绝启动：凭据等同于账号本身，宁可停下来人工处理，也不悄悄丢掉或存成空的。
ALTER TABLE "eh_credentials" RENAME COLUMN "member_id" TO "ipb_member_id";--> statement-breakpoint
ALTER TABLE "eh_credentials" ADD COLUMN "ipb_pass_hash" text;--> statement-breakpoint
ALTER TABLE "eh_credentials" ADD COLUMN "igneous" text;--> statement-breakpoint
UPDATE "eh_credentials"
SET "ipb_pass_hash" = coalesce("cookie"::jsonb ->> 'ipbPassHash', ''),
    "igneous" = coalesce("cookie"::jsonb ->> 'igneous', '');--> statement-breakpoint
ALTER TABLE "eh_credentials" ALTER COLUMN "ipb_pass_hash" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "eh_credentials" ALTER COLUMN "igneous" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "eh_credentials" DROP COLUMN "cookie";

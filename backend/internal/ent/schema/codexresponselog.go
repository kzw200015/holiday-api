package schema

import (
	"time"

	"entgo.io/ent"
	"entgo.io/ent/schema/field"
)

// CodexResponseLog 记录 /api/responses 调用日志。
type CodexResponseLog struct {
	ent.Schema
}

func (CodexResponseLog) Fields() []ent.Field {
	return []ent.Field{
		field.String("user_agent"),
		field.String("client_ip"),
		field.Int("input_tokens"),
		field.Int("cached_input_tokens"),
		field.Int("output_tokens"),
		field.Float("cache_rate"),
		field.Int("duration_ms"),
		field.String("account_id"),
		field.String("account_name"),
		field.Bool("is_sse"),
		field.Time("created_at").Default(time.Now).Immutable(),
	}
}

func (CodexResponseLog) Edges() []ent.Edge {
	return nil
}

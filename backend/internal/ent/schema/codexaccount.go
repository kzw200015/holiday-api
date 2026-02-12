package schema

import (
	"encoding/json"
	"time"

	"entgo.io/ent"
	"entgo.io/ent/dialect"
	"entgo.io/ent/schema/field"
)

// CodexAccount 保存已完成 OAuth 的 Codex 账户信息。
type CodexAccount struct {
	ent.Schema
}

func (CodexAccount) Fields() []ent.Field {
	return []ent.Field{
		field.String("name").NotEmpty(),
		field.String("account_id").Unique(),
		field.String("token"),
		field.Time("expires_at"),
		field.JSON("oauth_payload", json.RawMessage{}).
			SchemaType(map[string]string{dialect.Postgres: "jsonb"}),
		field.Time("created_at").Default(time.Now).Immutable(),
		field.Time("updated_at").Default(time.Now).UpdateDefault(time.Now),
	}
}

func (CodexAccount) Edges() []ent.Edge {
	return nil
}

package schema

import (
	"time"

	"entgo.io/ent"
	"entgo.io/ent/schema/field"
)

// CodexOAuthSession 记录一次 Codex OAuth 发起上下文（state + PKCE）。
type CodexOAuthSession struct {
	ent.Schema
}

func (CodexOAuthSession) Fields() []ent.Field {
	return []ent.Field{
		field.String("state").Unique(),
		field.String("code_verifier"),
		field.String("code_challenge"),
		field.Time("expires_at"),
		field.Time("created_at").Default(time.Now).Immutable(),
	}
}

func (CodexOAuthSession) Edges() []ent.Edge {
	return nil
}

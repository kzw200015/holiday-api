package schema

import (
	"entgo.io/ent"
	"entgo.io/ent/schema/field"
)

// HolidayDay 定义节假日日期模型。
type HolidayDay struct {
	ent.Schema
}

// Fields 定义 HolidayDay 的字段。
func (HolidayDay) Fields() []ent.Field {
	return []ent.Field{
		field.String("name"),
		field.String("date").Unique(),
		field.Bool("is_off_day"),
	}
}

// Edges 定义 HolidayDay 的边。
func (HolidayDay) Edges() []ent.Edge {
	return nil
}

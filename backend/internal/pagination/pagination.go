package pagination

import (
	"errors"
)

var (
	ErrInvalidPage      = errors.New("invalid page")
	ErrInvalidPageSize  = errors.New("invalid page size")
	ErrPageSizeTooLarge = errors.New("page size too large")
)

type Params struct {
	Page     int
	PageSize int
}

type PaginatedResult[T any] struct {
	Items    []T `json:"items"`
	Total    int `json:"total"`
	Page     int `json:"page"`
	PageSize int `json:"pageSize"`
}

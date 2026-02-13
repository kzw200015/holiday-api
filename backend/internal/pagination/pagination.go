package pagination

import (
	"errors"
	"strconv"
	"strings"
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

func Parse(pageText string, pageSizeText string, defaultPageSize int, maxPageSize int) (Params, error) {
	page := 1
	if strings.TrimSpace(pageText) != "" {
		value, err := strconv.Atoi(pageText)
		if err != nil || value <= 0 {
			return Params{}, ErrInvalidPage
		}
		page = value
	}

	pageSize := defaultPageSize
	if strings.TrimSpace(pageSizeText) != "" {
		value, err := strconv.Atoi(pageSizeText)
		if err != nil || value <= 0 {
			return Params{}, ErrInvalidPageSize
		}
		pageSize = value
	}

	if pageSize > maxPageSize {
		return Params{}, ErrPageSizeTooLarge
	}
	return Params{
		Page:     page,
		PageSize: pageSize,
	}, nil
}

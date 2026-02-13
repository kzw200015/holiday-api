package com.github.kzw200015.myapi.pagination;

import java.util.List;

/**
 * 分页结果结构：{ items, total, page, pageSize }。
 */
public record PaginatedResult<T>(List<T> items, long total, int page, int pageSize) {}

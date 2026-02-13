package com.github.kzw200015.myapi.holiday.service;

import java.util.List;

/**
 * 远程节假日数据响应体。
 */
record HolidayPayload(List<RemoteHolidayDay> days) {}

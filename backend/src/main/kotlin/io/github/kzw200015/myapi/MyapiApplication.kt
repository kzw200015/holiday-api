package io.github.kzw200015.myapi

import org.springframework.boot.autoconfigure.SpringBootApplication
import org.springframework.boot.runApplication

@SpringBootApplication
class MyapiApplication

fun main(args: Array<String>) {
	runApplication<MyapiApplication>(*args)
}

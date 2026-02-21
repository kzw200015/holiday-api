package com.github.kzw200015.myapi;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@EnableScheduling
public class MyapiApplication {
    public static void main(String[] args) {
        SpringApplication.run(MyapiApplication.class, args);
    }
}

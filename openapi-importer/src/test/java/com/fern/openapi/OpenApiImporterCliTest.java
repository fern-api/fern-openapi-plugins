package com.fern.openapi;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import org.junit.jupiter.api.Test;

public class OpenApiImporterCliTest {

    @Test
    public void test_open_api() {
        String openApiContents = readFileFromResources("medplum-openapi.json");
        OpenApiImporterCli.parse(openApiContents);
    }


    private static String readFileFromResources(String filename) {
        try {
            InputStream fileStream =
                    OpenApiImporterCliTest.class.getClassLoader().getResourceAsStream(filename);
            return new String(fileStream.readAllBytes(), StandardCharsets.UTF_8);
        } catch (IOException e) {
            throw new RuntimeException(e);
        }
    }
}

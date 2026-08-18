import json
import unittest

from admin.plugin_security import (
    build_google_credentials_stdin,
    build_plugin_command,
    redact_sensitive_data,
    redact_sensitive_text,
)


class PluginSecurityTests(unittest.TestCase):
    def test_google_credentials_are_serialized_for_stdin_not_argv(self):
        access_token = "SENTINEL_ACCESS_TOKEN"
        refresh_token = "SENTINEL_REFRESH_TOKEN"

        command = build_plugin_command(
            "google-analytics",
            "query",
            ["123456789"],
            {"metrics": "activeUsers"},
        )
        payload = build_google_credentials_stdin(access_token, refresh_token)

        self.assertNotIn(access_token, command)
        self.assertNotIn(refresh_token, command)
        self.assertEqual(
            json.loads(payload),
            {
                "access_token": access_token,
                "refresh_token": refresh_token,
            },
        )

    def test_google_credential_options_are_rejected(self):
        for option_name in (
            "accessToken",
            "refreshToken",
            "access_token",
            "refresh-token",
        ):
            with self.subTest(option_name=option_name):
                with self.assertRaises(ValueError):
                    build_plugin_command(
                        "google-search-console",
                        "list-sites-json",
                        [],
                        {option_name: "SENTINEL"},
                    )

    def test_non_secret_plugin_options_keep_the_existing_cli_shape(self):
        self.assertEqual(
            build_plugin_command(
                "google-search-console",
                "query",
                ["sc-domain:example.com"],
                {"dimensions": "query,page", "limit": 50},
            ),
            [
                "node",
                "/app/plugins/google-search-console/index.js",
                "query",
                "sc-domain:example.com",
                "--dimensions",
                "query,page",
                "--limit",
                "50",
            ],
        )

    def test_known_secrets_and_authorization_values_are_redacted(self):
        secret = "SENTINEL_ACCESS_TOKEN"
        value = (
            f"failed token={secret} Authorization: Bearer abc.def "
            "--refreshToken refresh-value"
        )

        sanitized = redact_sensitive_text(value, [secret])

        self.assertNotIn(secret, sanitized)
        self.assertNotIn("abc.def", sanitized)
        self.assertNotIn("refresh-value", sanitized)
        self.assertGreaterEqual(sanitized.count("[REDACTED]"), 3)

    def test_sensitive_response_fields_are_redacted_recursively(self):
        sanitized = redact_sensitive_data(
            {
                "access_token": "one",
                "nested": [{"refreshToken": "two"}],
                "safe": "visible",
            }
        )

        self.assertEqual(sanitized["access_token"], "[REDACTED]")
        self.assertEqual(sanitized["nested"][0]["refreshToken"], "[REDACTED]")
        self.assertEqual(sanitized["safe"], "visible")


if __name__ == "__main__":
    unittest.main()

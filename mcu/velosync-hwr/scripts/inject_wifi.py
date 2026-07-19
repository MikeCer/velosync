Import("env")

import os


def string_macro(value):
    return env.StringifyMacro(value.replace("\\", "\\\\"))


ssid = os.environ.get("VELOSYNC_WIFI_SSID")
password = os.environ.get("VELOSYNC_WIFI_PASSWORD")

if ssid is not None and password is not None:
    env.Append(
        CPPDEFINES=[
            ("WIFI_SSID", string_macro(ssid)),
            ("WIFI_PASSWORD", string_macro(password)),
        ]
    )

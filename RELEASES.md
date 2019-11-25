# Release Notes

## Version 0.4.2 - 2019/11/25

**List of changes**

-   Deactivation of ESM (one of the library used in the plugin) caching mechanism as it is causing update issue

## Version 0.4.1 - 2019/11/25

**List of changes**

-   Fixed an issue preventing commands to be executed (change in temp, ...)
-   Fixed an issue where the plugin would report incorrect values to homekit after a failed update

## Version 0.4.0 - 2019/11/16

> **Breaking Change**
>
> Due to the change in the name of some accessories, they will be detected as new by HomeKit. This will potentially break existing automation rules

**List of changes**

-   Filtering of inactive zones
-   Fix an issue in accessories naming preventing multiple installations
-   More consistent name of accessories:
    -   They now always start by the {Name of the installation}
    -   Followed by the name of the zone (if relevant)
    -   Then their individual name
-   More consistent logging message

## Version 0.3.1 - 2019/11/5

**List of changes**

-   Erroneous homebridge version in engine dependencies

## Version 0.3.0 - 2019/11/5

This is the first public release.
See README.md for full features list.

**List of changes**

-   Switch from Axios to fetch api
-   Contact sensors to monitor status of the connection
-   History for temperature measurements
-   Significant refactoring of the code

## Any version < 0.3.0

These are internal version only. Not meant to be used by anyone.

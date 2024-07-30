# Batch-Role-Add-Bot

Adds role to users who have left any message in configured channels.

## Instructions

1. Please look at [Discord-Bot-Parent](https://github.com/elliot-gh/Discord-Bot-Parent) to setup the main parent project
2. Copy `config.example.yaml` as `config.yaml` and edit as appropriate.
3. Run parent.

## Usage

- `/batchroles add`: Pick a role to assign. All users that left a message in the channels configured in `config.yaml` will get this role. There is no validation of permissions for this; make sure you don't accidentally pick an admin/moderator role 🙂

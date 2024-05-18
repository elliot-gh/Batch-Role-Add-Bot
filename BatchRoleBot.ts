import {
    ChatInputCommandInteraction, CommandInteraction, ContextMenuCommandBuilder, EmbedBuilder, FetchMessagesOptions, GatewayIntentBits, SlashCommandBuilder
} from "discord.js";
import { BotWithConfig } from "../../BotWithConfig";

export type BatchRoleConfig = {
    channelIds: string[]
}

export class BatchRoleBot extends BotWithConfig {
    private static readonly CMD_BATCH = "batchroles";
    private static readonly SUBCMD_ADD = "add";
    private static readonly OPT_ROLE = "role";

    protected readonly intents: GatewayIntentBits[];
    protected readonly commands: [SlashCommandBuilder];
    private readonly config: BatchRoleConfig;

    constructor() {
        super("RoleIconBot", import.meta);
        this.config = this.readYamlConfig<BatchRoleConfig>("config.yaml");
        this.intents = [GatewayIntentBits.Guilds | GatewayIntentBits.GuildModeration];
        const slashBatch = new SlashCommandBuilder()
            .setName(BatchRoleBot.CMD_BATCH)
            .setDescription("Batch role operations")
            .setDMPermission(false)
            .addSubcommand(subcommand =>
                subcommand
                    .setName(BatchRoleBot.SUBCMD_ADD)
                    .setDescription("Add a role to multiple users in config")
                    .addRoleOption(option =>
                        option
                            .setName(BatchRoleBot.OPT_ROLE)
                            .setDescription("The role to add")
                            .setRequired(true)
                    )
            ) as SlashCommandBuilder;
        this.commands = [slashBatch];
    }

    getIntents(): GatewayIntentBits[] {
        return this.intents;
    }

    getSlashCommands(): (SlashCommandBuilder | ContextMenuCommandBuilder)[] {
        return this.commands;
    }

    async processCommand(interaction: CommandInteraction): Promise<void> {
        if (!interaction.isChatInputCommand() ||
            interaction.user.bot ||
            interaction.user.id === interaction.client.user.id ||
            interaction.commandName !== BatchRoleBot.CMD_BATCH) {
            return;
        }

        this.logger.info(`got interaction: ${interaction}`);
        try {
            switch(interaction.options.getSubcommand()) {
                case BatchRoleBot.SUBCMD_ADD:
                    await this.handleBatchAdd(interaction);
                    break;
            }
        } catch (error) {
            this.logger.error(`Uncaught error in processSlashCommand(): ${error}`);
        }
    }

    private async handleBatchAdd(interaction: ChatInputCommandInteraction): Promise<void> {
        if (interaction.guild == null) {
            return;
        }

        const replyChannel = interaction.channel;
        const roleOpt = interaction.options.getRole(BatchRoleBot.OPT_ROLE, true);
        await interaction.reply("starting");

        const userIdAdded: { [id: string]: boolean } = {};
        const userIdFailed: { [id: string]: boolean } = {};
        const channelToUserCount: { [id: string]: number } = {};
        for (const channelId of this.config.channelIds) {
            this.logger.info(`Fetching users who have sent messages in channel ${channelId}`);

            const channel = await interaction.guild.channels.fetch(channelId);
            if (!channel?.isTextBased()) {
                this.logger.warn(`Channel ${channelId} is not text-based`);
                continue;
            }

            const currentUserIds = new Set<string>();
            let lastMessageId: string | null = null;

            // eslint-disable-next-line no-constant-condition
            while (true)
            {
                const options: FetchMessagesOptions = { limit: 100 };
                if (lastMessageId != null) {
                    options.before = lastMessageId;
                }

                const messages = await channel.messages.fetch(options);
                if (messages.size === 0) {
                    break;
                }

                for (const message of messages.values()) {
                    if (userIdAdded[message.author.id] !== undefined) {
                        continue;
                    }

                    currentUserIds.add(message.author.id);
                }

                lastMessageId = messages.last()!.id;
            }

            for (const userId of currentUserIds) {
                try {
                    const user = interaction.guild.members.cache.get(userId);
                    if (user === undefined) {
                        this.logger.warn(`User ${userId} not found`);
                        userIdFailed[userId] = true;
                        continue;
                    }

                    await user.roles.add(roleOpt.id);
                    userIdAdded[userId] = true;
                } catch (error) {
                    this.logger.error(`Failed to add role to user ${userId}: ${error}`);
                    userIdFailed[userId] = true;
                }
            }

            channelToUserCount[channelId] = currentUserIds.size;
        }

        let failedCount = 0;
        for (const userId in userIdFailed) {
            if (userIdFailed[userId] !== undefined && userIdFailed[userId]) {
                failedCount++;
            }
        }

        let message = `Added roles to ${Object.keys(userIdAdded).length} users.\nFailed to add to ${failedCount} users.\n`;
        for (const channelId in channelToUserCount) {
            message += `\n$<#${channelId}> had ${channelToUserCount[channelId]} unique new users.`;
        }

        this.logger.info(message);

        const embed = new EmbedBuilder()
            .setTitle("Batch role add results")
            .setDescription(message);
        await replyChannel!.send({ embeds: [embed] });
    }
}

export default new BatchRoleBot();

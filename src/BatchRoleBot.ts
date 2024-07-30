import {
    ChatInputCommandInteraction, ContextMenuCommandBuilder, EmbedBuilder, FetchMessagesOptions, GatewayIntentBits, Interaction, SlashCommandBuilder
} from "discord.js";
import { BaseBotWithConfig } from "../../../interfaces/BaseBotWithConfig.js";
import { EventHandlerDict } from "../../../interfaces/IBot.js";
import { ShouldIgnoreEvent } from "../../../utils/DiscordUtils.js";
import { BatchRoleConfig } from "./BatchRoleConfig.js";

export class BatchRoleBot extends BaseBotWithConfig {
    private static readonly CMD_BATCH = "batchroles";
    private static readonly SUBCMD_ADD = "add";
    private static readonly OPT_ROLE = "role";
    private static readonly OPT_CONFIRM = "confirm";

    protected readonly intents: GatewayIntentBits[];
    protected readonly commands: [SlashCommandBuilder];
    private readonly config: BatchRoleConfig;

    constructor() {
        super("BatchRoleBot", import.meta);
        this.config = this.readYamlConfig<BatchRoleConfig>("config.yaml");
        this.intents = [GatewayIntentBits.Guilds | GatewayIntentBits.GuildMembers | GatewayIntentBits.GuildModeration];
        const slashBatch = new SlashCommandBuilder()
            .setName(BatchRoleBot.CMD_BATCH)
            .setDescription("Batch role operations")
            .setDMPermission(false)
            .addSubcommand(subcommand =>
                subcommand
                    .setName(BatchRoleBot.SUBCMD_ADD)
                    .setDescription("Add a role to multiple users in config. NO CONFIRMATION, BE CAREFUL ABOUT ROLE PERMISSIONS!")
                    .addRoleOption(option =>
                        option
                            .setName(BatchRoleBot.OPT_ROLE)
                            .setDescription("The role to add")
                            .setRequired(true)
                    )
                    .addBooleanOption(option =>
                        option
                            .setName(BatchRoleBot.OPT_CONFIRM)
                            .setDescription("ARE YOU SURE ABOUT THE ROLE YOU PICKED")
                            .setRequired(true)
                    )
            ) as SlashCommandBuilder;
        this.commands = [slashBatch];
    }

    getEventHandlers(): EventHandlerDict {
        return {
            interactionCreate: this.processInteraction.bind(this)
        };
    }

    getIntents(): GatewayIntentBits[] {
        return this.intents;
    }

    getSlashCommands(): (SlashCommandBuilder | ContextMenuCommandBuilder)[] {
        return this.commands;
    }

    async processInteraction(interaction: Interaction): Promise<void> {
        if (ShouldIgnoreEvent(interaction) || !interaction.isChatInputCommand()) {
            return;
        }

        await this.processCommand(interaction);
    }

    private async processCommand(interaction: ChatInputCommandInteraction): Promise<void> {
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

        this.logger.info(`handleBatchAdd() got interaction: ${interaction} from: ${interaction.user.id}`);

        const replyChannel = interaction.channel;
        const roleOpt = interaction.options.getRole(BatchRoleBot.OPT_ROLE, true);
        const confirmOpt = interaction.options.getBoolean(BatchRoleBot.OPT_CONFIRM, true);
        if (!confirmOpt) {
            this.logger.warn(`User ${interaction.user.id} did not confirm`);
            await interaction.reply("confirm was false, not running");
            return;
        }

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
                    if (userIdAdded[message.author.id] !== undefined || message.author.bot) {
                        continue;
                    }

                    currentUserIds.add(message.author.id);
                }

                lastMessageId = messages.last()!.id;
            }

            for (const userId of currentUserIds) {
                try {
                    const user = await interaction.guild.members.fetch(userId);
                    if (user === undefined) {
                        this.logger.warn(`User ${userId} not found`);
                        userIdFailed[userId] = true;
                        continue;
                    }

                    await user.roles.add(roleOpt.id);
                    userIdAdded[userId] = true;
                    this.logger.info(`Added role to user ${userId}`);

                    if (userIdFailed[userId] !== undefined && userIdFailed[userId]) {
                        userIdFailed[userId] = false;
                    }
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
                this.logger.warn(`Failed to add role to user ${userId}`);
                failedCount++;
            }
        }

        let message = `Added roles to ${Object.keys(userIdAdded).length} users.\nFailed to add to ${failedCount} users.\n`;
        for (const channelId in channelToUserCount) {
            message += `\n<#${channelId}> had ${channelToUserCount[channelId]} unique new users.`;
        }

        this.logger.info(message);

        const embed = new EmbedBuilder()
            .setTitle("Batch role add results")
            .setDescription(message);
        await replyChannel!.send({ embeds: [embed] });
    }
}

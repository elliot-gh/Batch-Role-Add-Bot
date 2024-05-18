import {
    ChatInputCommandInteraction, CommandInteraction, ContextMenuCommandBuilder, EmbedBuilder, GatewayIntentBits, SlashCommandBuilder
} from "discord.js";
import { BotWithConfig } from "../../BotWithConfig";

export type BatchRoleConfig = {
    userIds: string[]
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
        await interaction.deferReply();
        const roleOpt = interaction.options.getRole(BatchRoleBot.OPT_ROLE, true);
        let added = 0;
        let failedCount = 0;
        const failedArr: string[] = [];
        const set = new Set<string>();
        this.config.userIds.forEach(element => {
            set.add(element);
        });

        for (const userId of set) {
            try {
                const member = await interaction.guild!.members.fetch(userId);
                await member.roles.add(roleOpt.id);
                added++;
            } catch (error) {
                this.logger.error(`Error adding role to user ${userId}: ${error}`);
                failedCount++;
                failedArr.push(userId);
            }
        }

        const embed = new EmbedBuilder()
            .setTitle("Batch Role Add Operation")
            .setDescription(`Config had ${set.size} unique user IDs.\nAdded role ${roleOpt.name} to ${added} users.\nFailed to add to ${failedCount} users.`);
        await interaction.editReply({ embeds: [embed] });
    }
}

export default new BatchRoleBot();

# Map of ServerSettings.ini keys — MIDWAY server

- Date of capture: 2026-11-17, source: `/Server/SCUM/Saved/Config/WindowsServer/ServerSettings.ini` (read-only FTPS).
- Server: SCUM Dedicated 1.3.6.1.177547, `scum.ServerSettingsVersion=7`. File: 17583 bytes, SHA-256 `0567fb3155d35ccc…` (original in %TEMP%\rufp, not committed).
- Total keys: **439** in sections [General]=66, [World]=142, [Respawn]=29, [Vehicles]=46, [Damage]=21, [Features]=135. Reference SEA (scumeasyadmin.de, verified 1.3.3.4–1.3.6.1): **437 keys** stable since 1.3.1.0 — our delta **+2**: `scum.Wolfswagen*` (3 keys, modded vehicle) and see «Discrepancies» below.
- Value types: bool `0/1` · int · float · time `HH:MM:SS` (hours may exceed 24: `240:00:00`) · price in gold `10g` (suffix g = gold, without it = money) · `-` = disabled. Secret values masked `***`.

## Critical behavior (SEA, VERIFIED)

- **The server overwrites ServerSettings.ini on shutdown** with its in-memory settings: edit only with the server STOPPED (download → edit → upload → start).
- The folder also contains 6 Steam-ID lists (AdminUsers.ini with rights `[GodMode]/[SetGodMode]`, ServerSettingsAdminUsers.ini, Whitelisted/Exclusive/Banned/Silenced), RaidTimes.json and Notifications.json (read by the server), GameUserSettings.ini/Input.ini — client-side, can be ignored. EconomyOverride.json is module TC.

## Discrepancies with the SEA directory (437)

- `scum.WolfswagenMaxAmount`, `scum.WolfswagenMaxFunctionalAmount`, `scum.WolfswagenMinPurchasedAmount` — a modded vehicle (not vanilla), apparently injected by the server/mods. To be re-checked key-by-key against the SEA category pages (22 categories) at the GUI stage.

## Keys by groups (27)

### Server and general (21)

| Key | Type | Value (17.11.2026) |
|---|---|---|
| `scum.ServerName` | text | `SCUM Server` |
| `scum.ServerDescription` | text | `Server Description` |
| `scum.ServerPassword` | off/empty | `***` |
| `scum.MaxPlayers` | int | `10` |
| `scum.PlaySafeIdProtection` | bool | `0` |
| `scum.ServerBannerUrl` | off/empty | `` |
| `scum.ServerPlaystyle` | text | `PVE` |
| `scum.WelcomeMessage` | text | `Welcome to our SCUM Server` |
| `scum.MessageOfTheDay` | text | `This is the Message of the Day.` |
| `scum.MessageOfTheDayCooldown` | float | `10.00` |
| `scum.MinServerTickRate` | int | `5` |
| `scum.MaxServerTickRate` | int | `30` |
| `scum.MaxPingCheckEnabled` | bool | `1` |
| `scum.MaxPing` | float | `400.00` |
| `scum.MaxNumberOfConsecutiveHighPingReadings` | int | `5` |
| `scum.RustyLocksLogging` | bool | `0` |
| `scum.PartialWipe` | bool | `0` |
| `scum.GoldWipe` | bool | `0` |
| `scum.FullWipe` | bool | `0` |
| `scum.DaysSinceLastLoginToBecomeInactive` | int | `180` |
| `scum.ServerSettingsVersion` | int | `7` |

### Rules and access (32)

| Key | Type | Value (17.11.2026) |
|---|---|---|
| `scum.AllowFirstPerson` | bool | `1` |
| `scum.AllowThirdPerson` | bool | `1` |
| `scum.AllowCrosshair` | bool | `1` |
| `scum.AllowVoting` | bool | `1` |
| `scum.AllowMapScreen` | bool | `1` |
| `scum.AllowKillClaiming` | bool | `1` |
| `scum.AllowComa` | bool | `1` |
| `scum.AllowMinesAndTraps` | bool | `1` |
| `scum.AllowSkillGainInSafeZones` | bool | `0` |
| `scum.AllowEvents` | bool | `1` |
| `scum.LimitGlobalChat` | bool | `0` |
| `scum.AllowGlobalChat` | bool | `1` |
| `scum.AllowLocalChat` | bool | `1` |
| `scum.AllowSquadChat` | bool | `1` |
| `scum.AllowAdminChat` | bool | `1` |
| `scum.HideKillNotification` | bool | `1` |
| `scum.DisableExamineGhost` | bool | `0` |
| `scum.DisableTimedGifts` | bool | `0` |
| `scum.VotingDuration` | float | `60.00` |
| `scum.PlayerMinimalVotingInterest` | float | `0.50` |
| `scum.PlayerPositiveVotePercentage` | float | `0.50` |
| `scum.EnableSpawnOnGround` | bool | `0` |
| `scum.DisableSuicidePuppetSpawning` | bool | `0` |
| `scum.DisableLootPuppetSpawning` | bool | `0` |
| `scum.AllowMultipleFlagsPerPlayer` | bool | `0` |
| `scum.AllowFlagPlacementOnBBElements` | bool | `0` |
| `scum.MovementInertiaAmount` | float | `1.00` |
| `scum.StaminaDrainOnJumpMultiplier` | float | `1.00` |
| `scum.StaminaDrainOnClimbMultiplier` | float | `1.00` |
| `scum.DisableExhaustion` | bool | `0` |
| `scum.BedrollVisibilityTimer` | float | `1.00` |
| `scum.AllowAutomaticParachuteOpening` | bool | `1` |

### Time, weather, map (12)

| Key | Type | Value (17.11.2026) |
|---|---|---|
| `scum.TimeOfDaySpeed` | float | `3.84` |
| `scum.NighttimeDarkness` | float | `0.00` |
| `scum.SunriseTime` | time | `06:00:00` |
| `scum.SunsetTime` | time | `21:00:00` |
| `scum.CustomMapEnabled` | bool | `0` |
| `scum.CustomMapCenterXCoordinate` | float | `0.00` |
| `scum.CustomMapCenterYCoordinate` | float | `0.00` |
| `scum.CustomMapWidth` | float | `15.24` |
| `scum.CustomMapHeight` | float | `15.24` |
| `scum.DoorLockability.Garage` | bool | `0` |
| `scum.RadiationEnabled` | bool | `1` |
| `scum.BodySimulationSpeedMultiplier` | float | `3.84` |

### World (misc.) (22)

| Key | Type | Value (17.11.2026) |
|---|---|---|
| `scum.MaxAllowedCharacters` | int | `-1` |
| `scum.MaxAllowedPuppets` | int | `-1` |
| `scum.MaxAllowedNPCs` | int | `-1` |
| `scum.EnableLootPuppetHorde` | bool | `1` |
| `scum.ProbabilityForArmedNPCToDropItemFromHandsWhenSearched` | float | `1.00` |
| `scum.MinimumDurabilityOfArmedNPCsDroppedItemFromHands` | float | `0.20` |
| `scum.MaximumDurabilityOfArmedNPCsDroppedItemFromHands` | float | `0.30` |
| `scum.EnableDropshipAbandonedBunkerEncounter` | bool | `1` |
| `scum.EnableDropshipBaseBuildingEncounter` | bool | `0` |
| `scum.SpawnEncountersInThreatZonesIgnoringBaseBuilding` | bool | `0` |
| `scum.EnableEncounterManagerLowPlayerCountMode` | bool | `0` |
| `scum.StartTimeOfDay` | time | `08:00:00` |
| `scum.EnableFog` | bool | `1` |
| `scum.ShouldDestroyEntitiesOutsideMapLimitsOnRestart` | bool | `1` |
| `scum.AreAnimalsAllowedInWorld` | bool | `1` |
| `scum.MaxNonVirtualAnimalsInWorld` | int | `500` |
| `scum.MaxAllowedKillboxKeycards` | int | `4` |
| `scum.MaxAllowedKillboxKeycards_PoliceStation` | int | `3` |
| `scum.MaxAllowedKillboxKeycards_RadiationZone` | bool | `1` |
| `scum.MaxAllowedApexFacilityKeycards` | int | `4` |
| `scum.MaxAllowedApexFacilityKeycards_PoliceStation` | int | `3` |
| `scum.MaxAllowedApexFacilityKeycards_RadiationZone` | bool | `1` |

### Encounters and hordes (37)

| Key | Type | Value (17.11.2026) |
|---|---|---|
| `scum.EncounterBaseCharacterAmountMultiplier` | float | `1.00` |
| `scum.EncounterExtraCharacterPerPlayerMultiplier` | float | `1.00` |
| `scum.EncounterExtraCharacterPlayerCapMultiplier` | float | `1.00` |
| `scum.EncounterCharacterRespawnTimeMultiplier` | float | `1.00` |
| `scum.EncounterCharacterRespawnBatchSizeMultiplier` | float | `1.00` |
| `scum.EncounterCharacterAggressiveSpawnChanceOverride` | float | `-1.00` |
| `scum.EncounterCharacterAINoiseResponseRadiusMultiplier` | float | `1.00` |
| `scum.EncounterHordeGroupBaseCharacterAmountMultiplier` | float | `1.00` |
| `scum.EncounterHordeGroupExtraCharacterPerPlayerMultiplier` | float | `1.00` |
| `scum.EncounterHordeGroupExtraCharacterPlayerCapMultiplier` | float | `1.00` |
| `scum.EncounterHordeBaseCharacterAmountMultiplier` | float | `1.00` |
| `scum.EncounterHordeExtraCharacterPerPlayerMultiplier` | float | `1.00` |
| `scum.EncounterHordeExtraCharacterPlayerCapMultiplier` | float | `1.00` |
| `scum.EncounterHordeActivationChanceMultiplier` | float | `1.00` |
| `scum.EncounterHordeNoiseCheckCooldownMultiplier` | float | `1.00` |
| `scum.EncounterHordeSpawnDistanceMultiplier` | float | `1.00` |
| `scum.EncounterHordeGroupRefillTimeMultiplier` | float | `1.00` |
| `scum.EncounterHordeShouldPlayActivationSound` | bool | `0` |
| `scum.EncounterHordePuppetHordeActivationScreamOverrideChance` | float | `-1.00` |
| `scum.EncounterCanRemoveLowPriorityCharacters` | bool | `1` |
| `scum.EncounterCanClampCharacterNumWhenOutOfResources` | bool | `1` |
| `scum.EncounterCharacterSpawnDistanceMinOverrideLTZ` | float | `-1.00` |
| `scum.EncounterCharacterSpawnDistanceMaxOverrideLTZ` | float | `-1.00` |
| `scum.EncounterCharacterSpawnDistanceMinOverrideLargePOI` | float | `-1.00` |
| `scum.EncounterCharacterSpawnDistanceMaxOverrideLargePOI` | float | `-1.00` |
| `scum.EncounterCharacterRespawnDistanceMinOverrideLTZ` | float | `-1.00` |
| `scum.EncounterCharacterRespawnDistanceMaxOverrideLTZ` | float | `-1.00` |
| `scum.EncounterCharacterRespawnDistanceMinOverrideLargePOI` | float | `-1.00` |
| `scum.EncounterCharacterRespawnDistanceMaxOverrideLargePOI` | float | `-1.00` |
| `scum.EncounterLTZRadiusMultiplier` | float | `1.00` |
| `scum.EncounterMTZRadiusMultiplier` | float | `1.00` |
| `scum.EncounterHTZRadiusMultiplier` | float | `1.00` |
| `scum.EncounterVirtualizedTimeOverride` | float | `-1.00` |
| `scum.EncounterZoneActivationDistanceMultiplier` | float | `1.00` |
| `scum.EncounterGlobalZoneCooldownMultiplier` | float | `1.00` |
| `scum.EncounterEnableSpawnPreventionAreaSpawnOnCharacterDeath` | bool | `0` |
| `scum.EncounterNeverRespawnCharacters` | bool | `0` |

### Puppets (zombies) (7)

| Key | Type | Value (17.11.2026) |
|---|---|---|
| `scum.PuppetsCanOpenDoors` | bool | `1` |
| `scum.PuppetsCanVaultWindows` | bool | `1` |
| `scum.PuppetHealthMultiplier` | float | `1.00` |
| `scum.PuppetRunningSpeedMultiplier` | float | `1.00` |
| `scum.PuppetCullDistanceOverride` | float | `-1.00` |
| `scum.PuppetLimpingHealthThreshold` | float | `-1.00` |
| `scum.PuppetWorldEncounterSpawnWeightMultiplier` | float | `1.00` |

### NPC, sentries, dropships (21)

| Key | Type | Value (17.11.2026) |
|---|---|---|
| `scum.MaxAllowedDrones` | bool | `0` |
| `scum.DisableSentrySpawning` | bool | `0` |
| `scum.EnableSentryRespawning` | bool | `1` |
| `scum.DropshipHealthMultiplier` | float | `1.00` |
| `scum.SentryHealthMultiplier` | float | `1.00` |
| `scum.ArmedNPCDifficultyLevel` | int | `2` |
| `scum.ArmedNPCHealthMultiplier` | float | `1.00` |
| `scum.ArmedNPCDamageMultiplier` | float | `1.00` |
| `scum.ArmedNPCSpreadMultiplier` | float | `1.00` |
| `scum.ArmedNPCRunningSpeedMultiplier` | float | `1.00` |
| `scum.ArmedNPCNetCullDistanceOverride` | float | `-1.00` |
| `scum.ArmedNPCLimpingHealthThreshold` | float | `-1.00` |
| `scum.DropshipWorldEncounterSpawnWeightMultiplier` | float | `1.00` |
| `scum.DropshipAbandonedBunkerEncounterTriggerChance` | float | `-1.00` |
| `scum.SentryDamageMultiplier` | float | `1.00` |
| `scum.SentryRailgunDamageMultiplier` | float | `1.00` |
| `scum.SentryGrenadeDamageMultiplier` | float | `1.00` |
| `scum.SentryBaseBuildingDamageMultiplier` | float | `1.00` |
| `scum.DropshipDamageMultiplier` | float | `1.00` |
| `scum.DropshipRailgunDamageMultiplier` | float | `1.00` |
| `scum.DropshipBaseBuildingElementsDamageMultiplier` | float | `1.00` |

### Animals and fishing (26)

| Key | Type | Value (17.11.2026) |
|---|---|---|
| `scum.MaxAllowedBirds` | int | `15` |
| `scum.AnimalNetCullDistanceOverride` | float | `-1.00` |
| `scum.AnimalGlobalDensityMultiplier` | float | `0.50` |
| `scum.BearPrevalenceMultiplier` | float | `1.00` |
| `scum.BoarPrevalenceMultiplier` | float | `1.00` |
| `scum.ChickenPrevalenceMultiplier` | float | `1.00` |
| `scum.DeerPrevalenceMultiplier` | float | `1.00` |
| `scum.DonkeyPrevalenceMultiplier` | float | `1.00` |
| `scum.GoatPrevalenceMultiplier` | float | `1.00` |
| `scum.HorsePrevalenceMultiplier` | float | `1.00` |
| `scum.RabbitPrevalenceMultiplier` | float | `1.00` |
| `scum.WolfPrevalenceMultiplier` | float | `1.00` |
| `scum.BearMaxHealthMultiplier` | float | `1.00` |
| `scum.BoarMaxHealthMultiplier` | float | `1.00` |
| `scum.ChickenMaxHealthMultiplier` | float | `1.00` |
| `scum.DeerMaxHealthMultiplier` | float | `1.00` |
| `scum.DonkeyMaxHealthMultiplier` | float | `1.00` |
| `scum.GoatMaxHealthMultiplier` | float | `1.00` |
| `scum.HorseMaxHealthMultiplier` | float | `1.00` |
| `scum.RabbitMaxHealthMultiplier` | float | `1.00` |
| `scum.WolfMaxHealthMultiplier` | float | `1.00` |
| `scum.FishingHighActivityZoneRotationTime` | float | `-1.00` |
| `scum.FishingHighActivityZoneAmount` | float | `-1.00` |
| `scum.WolfswagenMaxAmount` | int | `50` |
| `scum.WolfswagenMaxFunctionalAmount` | int | `20` |
| `scum.WolfswagenMinPurchasedAmount` | int | `5` |

### Bunkers and killboxes (12)

| Key | Type | Value (17.11.2026) |
|---|---|---|
| `scum.AbandonedBunkerCommotionThreshold` | float | `-1.00` |
| `scum.AbandonedBunkerCommotionThresholdPerPlayerExtra` | float | `-1.00` |
| `scum.AbandonedBunkerEnemyActivationThreshold` | float | `-1.00` |
| `scum.AbandonedBunkerEnemyActivationThresholdPerPlayerExtra` | float | `-1.00` |
| `scum.AbandonedBunkerResetArmoryLockersOnActivationOnly` | bool | `1` |
| `scum.EnableLockedLootContainers` | bool | `1` |
| `scum.AbandonedBunkerMaxSimultaneouslyActive` | int | `2` |
| `scum.AbandonedBunkerActiveDurationHours` | float | `24.00` |
| `scum.AbandonedBunkerKeyCardActiveDurationHours` | float | `3.00` |
| `scum.AbandonedBunkerBCUTerminalCooldown` | time | `24:00:00` |
| `scum.SecretBunkerKeyCardActiveDurationHours` | float | `0.50` |
| `scum.KillboxDefuseFailureBonus` | float | `0.20` |

### Airdrop (cargo drop) (7)

| Key | Type | Value (17.11.2026) |
|---|---|---|
| `scum.CargoDropCooldownMinimum` | float | `90.00` |
| `scum.CargoDropCooldownMaximum` | float | `120.00` |
| `scum.CargoDropFallDelay` | float | `540.00` |
| `scum.CargoDropFallDuration` | float | `60.00` |
| `scum.CargoDropSelfdestructTime` | float | `1200.00` |
| `scum.CargoDropZombieEncounterWeightMultiplier` | float | `1.00` |
| `scum.CargoDropDropshipEncounterWeightMultiplier` | float | `1.00` |

### Loot and spawners (6)

| Key | Type | Value (17.11.2026) |
|---|---|---|
| `scum.SpawnerProbabilityMultiplier` | float | `1.00` |
| `scum.ExamineSpawnerProbabilityMultiplier` | float | `1.00` |
| `scum.ExamineSpawnerExpirationTimeMultiplier` | float | `1.00` |
| `scum.SpawnerExpirationTimeMultiplier` | float | `1.00` |
| `scum.EnableItemCooldownGroups` | bool | `1` |
| `scum.ItemCooldownGroupsDurationMultiplier` | float | `1.00` |

### Operation and cleanup (15)

| Key | Type | Value (17.11.2026) |
|---|---|---|
| `scum.LogoutTimer` | float | `60.00` |
| `scum.LogoutTimerWhileCaptured` | float | `120.00` |
| `scum.LogoutTimerInBunker` | float | `30000.00` |
| `scum.MasterServerUpdateSendInterval` | float | `60.00` |
| `scum.MasterServerIsLocalTest` | bool | `0` |
| `scum.ItemVirtualizationRelevancyUpdatePeriod` | float | `1.00` |
| `scum.ItemVirtualizationEventProcessingTimeBudget` | float | `5.00` |
| `scum.ItemVirtualizationVisitorDistanceTravelledForUpdate` | float | `100.00` |
| `scum.ItemVirtualizationVisitorBounds` | float | `10000.00` |
| `scum.VirtualizedItemBounds` | float | `100.00` |
| `scum.LogSuicides` | bool | `0` |
| `scum.DeleteInactiveUsers` | bool | `1` |
| `scum.DeleteBannedUsers` | bool | `0` |
| `scum.LogChestOwnership` | bool | `1` |
| `scum.DeleteDuplicateChestsOnServerStartup` | bool | `0` |

### Fame and progress (11)

| Key | Type | Value (17.11.2026) |
|---|---|---|
| `scum.FameGainMultiplier` | float | `1.00` |
| `scum.FamePointPenaltyOnDeath` | float | `0.10` |
| `scum.FamePointPenaltyOnKilled` | float | `0.50` |
| `scum.FamePointRewardOnKill` | float | `0.25` |
| `scum.MaintainItemsExpirationTime` | time | `360:00:00` |
| `scum.NameChangeCooldown` | float | `168.00` |
| `scum.NameChangeCost` | int | `1000` |
| `scum.NewPlayerProtectionDuration` | float | `120.00` |
| `scum.HideQuickAccessBar` | bool | `0` |
| `scum.HideLifeIndicators` | bool | `0` |
| `scum.EnableDeenaOnServer` | bool | `1` |

### Skills (multipliers) (22)

| Key | Type | Value (17.11.2026) |
|---|---|---|
| `scum.EnableSelectedSkillsPromotion` | bool | `1` |
| `scum.ArcherySkillMultiplier` | float | `1.00` |
| `scum.AviationSkillMultiplier` | float | `1.00` |
| `scum.AwarenessSkillMultiplier` | float | `1.00` |
| `scum.BrawlingSkillMultiplier` | float | `1.00` |
| `scum.CamouflageSkillMultiplier` | float | `1.00` |
| `scum.CookingSkillMultiplier` | float | `1.00` |
| `scum.DemolitionSkillMultiplier` | float | `1.00` |
| `scum.DrivingSkillMultiplier` | float | `1.00` |
| `scum.EnduranceSkillMultiplier` | float | `1.00` |
| `scum.EngineeringSkillMultiplier` | float | `1.00` |
| `scum.FarmingSkillMultiplier` | float | `1.00` |
| `scum.HandgunSkillMultiplier` | float | `1.00` |
| `scum.MedicalSkillMultiplier` | float | `1.00` |
| `scum.MeleeWeaponsSkillMultiplier` | float | `1.00` |
| `scum.MotorcycleSkillMultiplier` | float | `1.00` |
| `scum.RiflesSkillMultiplier` | float | `1.00` |
| `scum.RunningSkillMultiplier` | float | `1.00` |
| `scum.SnipingSkillMultiplier` | float | `1.00` |
| `scum.StealthSkillMultiplier` | float | `1.00` |
| `scum.SurvivalSkillMultiplier` | float | `1.00` |
| `scum.ThieverySkillMultiplier` | float | `1.00` |

### Squads (14)

| Key | Type | Value (17.11.2026) |
|---|---|---|
| `scum.SquadRespawnPrice` | price(gold) | `3g` |
| `scum.SquadRespawnInitialTime` | float | `60.00` |
| `scum.SquadRespawnCooldown` | float | `60.00` |
| `scum.SquadCooldownResetMultiplier` | float | `2.00` |
| `scum.TombstoneMaxAmountPerSquad` | int | `-1` |
| `scum.SquadMemberCountAtIntLevel1` | int | `2` |
| `scum.SquadMemberCountAtIntLevel2` | int | `4` |
| `scum.SquadMemberCountAtIntLevel3` | int | `6` |
| `scum.SquadMemberCountAtIntLevel4` | int | `8` |
| `scum.SquadMemberCountAtIntLevel5` | int | `10` |
| `scum.SquadMemberCountLimitForPunishment` | int | `2` |
| `scum.RTSquadProbationDuration` | float | `1.00` |
| `scum.SquadMoneyPenaltyPerPrevSquadMember` | bool | `0` |
| `scum.SquadFamePointsPenaltyPerPrevSquadMember` | bool | `0` |

### Quests (6)

| Key | Type | Value (17.11.2026) |
|---|---|---|
| `scum.QuestsEnabled` | bool | `1` |
| `scum.QuestsGlobalCycleDuration` | time | `23:59:59` |
| `scum.QuestsTraderRefillCooldown` | time | `03:00:00` |
| `scum.QuestsPhoneRefillCooldown` | time | `01:00:00` |
| `scum.QuestsNoticeBoardRefillCooldown` | time | `02:00:00` |
| `scum.QuestRequirementsBlockTradeableItems` | bool | `0` |

### Respawn and death (24)

| Key | Type | Value (17.11.2026) |
|---|---|---|
| `scum.AllowSectorRespawn` | bool | `1` |
| `scum.AllowShelterRespawn` | bool | `1` |
| `scum.AllowSquadmateRespawn` | bool | `1` |
| `scum.RandomRespawnPrice` | int | `250` |
| `scum.SectorRespawnPrice` | int | `1000` |
| `scum.ShelterRespawnPrice` | price(gold) | `1g` |
| `scum.ShelterRespawnPriceOutsideFlagArea` | price(gold) | `2g` |
| `scum.RandomRespawnInitialTime` | float | `0.00` |
| `scum.SectorRespawnInitialTime` | float | `60.00` |
| `scum.ShelterRespawnInitialTime` | float | `60.00` |
| `scum.RandomRespawnCooldown` | float | `0.00` |
| `scum.SectorRespawnCooldown` | float | `240.00` |
| `scum.ShelterRespawnCooldown` | float | `240.00` |
| `scum.RandomCooldownResetMultiplier` | float | `0.00` |
| `scum.SectorCooldownResetMultiplier` | float | `3.00` |
| `scum.ShelterCooldownResetMultiplier` | float | `3.00` |
| `scum.RandomPricePerSquadmateModifier` | float | `0.00` |
| `scum.SectorPricePerSquadmateModifier` | float | `0.00` |
| `scum.ShelterPricePerSquadmateModifier` | float | `0.00` |
| `scum.CommitSuicideInitialTime` | float | `0.00` |
| `scum.CommitSuicideCooldown` | float | `60.00` |
| `scum.CommitSuicideCooldownResetMultiplier` | float | `1.25` |
| `scum.PermadeathThreshold` | int | `-2500` |
| `scum.CloningSicknessEnabled` | bool | `1` |

### Vehicle limits (37)

| Key | Type | Value (17.11.2026) |
|---|---|---|
| `scum.KingletDusterMaxAmount` | int | `2` |
| `scum.KingletDusterMinPurchasedAmount` | bool | `0` |
| `scum.DirtbikeMaxAmount` | int | `20` |
| `scum.DirtbikeMaxFunctionalAmount` | int | `15` |
| `scum.DirtbikeMinPurchasedAmount` | int | `5` |
| `scum.LaikaMaxAmount` | int | `50` |
| `scum.LaikaMaxFunctionalAmount` | int | `20` |
| `scum.LaikaMinPurchasedAmount` | int | `5` |
| `scum.MotorboatMaxAmount` | int | `11` |
| `scum.MotorboatMinPurchasedAmount` | int | `5` |
| `scum.WheelbarrowMaxAmount` | int | `20` |
| `scum.WheelbarrowMinPurchasedAmount` | int | `10` |
| `scum.BicycleMaxAmount` | int | `20` |
| `scum.BicycleMinPurchasedAmount` | int | `5` |
| `scum.RagerMaxAmount` | int | `50` |
| `scum.RagerMaxFunctionalAmount` | int | `20` |
| `scum.RagerMinPurchasedAmount` | int | `5` |
| `scum.CruiserMaxAmount` | int | `30` |
| `scum.CruiserMaxFunctionalAmount` | int | `20` |
| `scum.CruiserMinPurchasedAmount` | int | `5` |
| `scum.RisMaxAmount` | int | `50` |
| `scum.RisMaxFunctionalAmount` | int | `20` |
| `scum.RisMinPurchasedAmount` | int | `5` |
| `scum.DinghyMaxAmount` | int | `14` |
| `scum.DinghyMinPurchasedAmount` | int | `5` |
| `scum.SUPMaxAmount` | int | `20` |
| `scum.SUPMinPurchasedAmount` | int | `5` |
| `scum.KingletMarinerMaxAmount` | bool | `1` |
| `scum.KingletMarinerMinPurchasedAmount` | bool | `0` |
| `scum.TractorMaxAmount` | int | `50` |
| `scum.TractorMinPurchasedAmount` | int | `5` |
| `scum.SidecarBikeMaxAmount` | int | `25` |
| `scum.SidecarBikeMaxFunctionalAmount` | int | `15` |
| `scum.SidecarBikeMinPurchasedAmount` | int | `5` |
| `scum.MaximumTimeOfVehicleInactivity` | time | `240:00:00` |
| `scum.MaximumTimeForVehiclesInForbiddenZones` | time | `02:00:00` |
| `scum.LogVehicleDestroyed` | bool | `1` |

### Fuel and battery (6)

| Key | Type | Value (17.11.2026) |
|---|---|---|
| `scum.FuelDrainFromEngineMultiplier` | float | `1.00` |
| `scum.BatteryDrainFromEngineMultiplier` | float | `1.00` |
| `scum.BatteryDrainFromDevicesMultiplier` | float | `1.00` |
| `scum.BatteryDrainFromInactivityMultiplier` | float | `1.00` |
| `scum.BatteryChargeWithAlternatorMultiplier` | float | `1.00` |
| `scum.BatteryChargeWithDynamoMultiplier` | float | `1.00` |

### Damage (multipliers) (11)

| Key | Type | Value (17.11.2026) |
|---|---|---|
| `scum.HumanToHumanDamageMultiplier` | float | `1.00` |
| `scum.HumanToHumanArmedMeleeDamageMultiplier` | float | `1.00` |
| `scum.HumanToHumanUnarmedMeleeDamageMultiplier` | float | `1.00` |
| `scum.HumanToHumanThrowingDamageMultiplier` | float | `1.00` |
| `scum.ZombieDamageMultiplier` | float | `1.00` |
| `scum.ItemDecayDamageMultiplier` | float | `1.00` |
| `scum.FoodDecayDamageMultiplier` | float | `1.00` |
| `scum.WeaponDecayDamageOnFiring` | float | `1.00` |
| `scum.LockProtectionDamageMultiplier` | float | `1.00` |
| `scum.VehicleDamageMultiplier` | float | `0.2` |
| `scum.VehicleShootingDamageMultiplier` | float | `0.2` |

### Bases and flags (33)

| Key | Type | Value (17.11.2026) |
|---|---|---|
| `scum.UseMapBaseBuildingRestriction` | bool | `1` |
| `scum.UseBuildingProximityRestrictions` | bool | `1` |
| `scum.DisableBaseBuilding` | bool | `0` |
| `scum.MaximumTimeForChestsInForbiddenZones` | time | `02:00:00` |
| `scum.BaseBuildingAttackerSentryHealthMultiplier` | float | `1.00` |
| `scum.BaseBuildingEncounterTriggerChance` | float | `-1.00` |
| `scum.BaseBuildingEncounterTriggerTimeMultiplier` | float | `1.00` |
| `scum.BaseBuildingEncounterMinNumElementsToStart` | int | `-1` |
| `scum.BaseBuildingEncounterMinNumElementsToEnd` | int | `-1` |
| `scum.BaseBuildingEncounterDamagePercentageIncreasePerSquadMember` | float | `0.00` |
| `scum.BaseBuildingEncounterTimeToFullMinNumToEnd` | float | `-1.00` |
| `scum.BaseBuildingEncounterMaximumMinToEndReduction` | int | `-1` |
| `scum.MaximumBaseProximityWhenSpawning` | float | `10000.00` |
| `scum.BaseBuildingAttackerSentryDamageMultiplier` | float | `1.00` |
| `scum.BaseBuildingAttackerSentryRailgunDamageMultiplier` | float | `1.00` |
| `scum.BaseBuildingAttackerSentryGrenadeDamageMultiplier` | float | `1.00` |
| `scum.MaximumAmountOfElementsPerFlag` | int | `100` |
| `scum.ExtraElementsPerFlagForAdditionalSquadMember` | int | `25` |
| `scum.WeaponRackMaxAmountPerFlagArea` | int | `-1` |
| `scum.WeaponRackStartDecayingIfFlagAreaHasMoreThan` | int | `-1` |
| `scum.WallWeaponRackMaxAmountPerFlagArea` | int | `-1` |
| `scum.WallWeaponRackStartDecayingIfFlagAreaHasMoreThan` | int | `-1` |
| `scum.WellMaxAmountPerFlagArea` | int | `-1` |
| `scum.WellStartDecayingIfFlagAreaHasMoreThan` | int | `-1` |
| `scum.OvenMaxAmountPerFlagArea` | int | `-1` |
| `scum.OvenStartDecayingIfFlagAreaHasMoreThan` | int | `-1` |
| `scum.GardenMaxAmountPerFlagArea` | int | `-1` |
| `scum.SmokerMaxAmountPerFlagArea` | int | `-1` |
| `scum.SmokerStartDecayingIfFlagAreaHasMoreThan` | int | `-1` |
| `scum.AllowFloorPlacementOnHalfAndLowWalls` | bool | `0` |
| `scum.AllowWallPlacementOnHalfAndLowWalls` | bool | `1` |
| `scum.BaseElementsDecayRateMultiplier` | float | `1.00` |
| `scum.BaseBuildingDestructionLogDamageThreshold` | float | `20.00` |

### Raid protection (12)

| Key | Type | Value (17.11.2026) |
|---|---|---|
| `scum.FlagOvertakeDuration` | time | `24:00:00` |
| `scum.ChestAcquisitionDuration` | float | `24.00` |
| `scum.RaidProtectionType` | bool | `0` |
| `scum.RaidProtectionEnableLog` | bool | `0` |
| `scum.RaidProtectionFlagSpecificChangeSettingCooldown` | time | `120:00:00` |
| `scum.RaidProtectionFlagSpecificChangeSettingPrice` | price(gold) | `10g` |
| `scum.RaidProtectionFlagSpecificMaxProtectionTime` | time | `08:00:00` |
| `scum.RaidProtectionOfflineProtectionStartDelay` | time | `00:30:00` |
| `scum.RaidProtectionOfflineMaxProtectionTime` | off/empty | `-` |
| `scum.RaidProtectionGlobalShouldShowRaidTimesMessage` | bool | `1` |
| `scum.RaidProtectionGlobalShouldShowRaidAnnouncementMessage` | bool | `1` |
| `scum.RaidProtectionGlobalShouldShowRaidStartEndMessages` | bool | `1` |

### Turrets (8)

| Key | Type | Value (17.11.2026) |
|---|---|---|
| `scum.TurretMaxAmountPerFlagArea` | int | `-1` |
| `scum.TurretStartDecayingIfFlagAreaHasMoreThan` | int | `-1` |
| `scum.TurretsAttackPrisoners` | bool | `1` |
| `scum.TurretsAttackPuppets` | bool | `1` |
| `scum.TurretsAttackVehicles` | bool | `1` |
| `scum.TurretsAttackSentries` | bool | `1` |
| `scum.TurretsAttackAnimals` | bool | `0` |
| `scum.TurretsAttackArmedNPCs` | bool | `1` |

### Water (pumps) (8)

| Key | Type | Value (17.11.2026) |
|---|---|---|
| `scum.WaterPricePerUnitMultiplier` | float | `1.00` |
| `scum.WaterPeriodicInitialAmountMultiplier` | float | `1.00` |
| `scum.WaterPeriodicMaxAmountMultiplier` | float | `1.00` |
| `scum.WaterPeriodicReplenishAmountMultiplier` | float | `1.00` |
| `scum.WaterPeriodicReplenishIntervalMultiplier` | float | `1.00` |
| `scum.WaterProximityReplenishAmountMultiplier` | float | `1.00` |
| `scum.WaterProximityReplenishChanceMultiplier` | float | `1.00` |
| `scum.WaterProximityReplenishTimeoutMultiplier` | float | `1.00` |

### Gasoline (pumps) (8)

| Key | Type | Value (17.11.2026) |
|---|---|---|
| `scum.GasolinePricePerUnitMultiplier` | float | `1.00` |
| `scum.GasolinePeriodicInitialAmountMultiplier` | float | `1.00` |
| `scum.GasolinePeriodicMaxAmountMultiplier` | float | `1.00` |
| `scum.GasolinePeriodicReplenishAmountMultiplier` | float | `1.00` |
| `scum.GasolinePeriodicReplenishIntervalMultiplier` | float | `1.00` |
| `scum.GasolineProximityReplenishAmountMultiplier` | float | `1.00` |
| `scum.GasolineProximityReplenishChanceMultiplier` | float | `1.00` |
| `scum.GasolineProximityReplenishTimeoutMultiplier` | float | `1.00` |

### Propane (pumps) (8)

| Key | Type | Value (17.11.2026) |
|---|---|---|
| `scum.PropanePricePerUnitMultiplier` | float | `1.00` |
| `scum.PropanePeriodicInitialAmountMultiplier` | float | `1.00` |
| `scum.PropanePeriodicMaxAmountMultiplier` | float | `1.00` |
| `scum.PropanePeriodicReplenishAmountMultiplier` | float | `1.00` |
| `scum.PropanePeriodicReplenishIntervalMultiplier` | float | `1.00` |
| `scum.PropaneProximityReplenishAmountMultiplier` | float | `1.00` |
| `scum.PropaneProximityReplenishChanceMultiplier` | float | `1.00` |
| `scum.PropaneProximityReplenishTimeoutMultiplier` | float | `1.00` |

### Features (misc.) (13)

| Key | Type | Value (17.11.2026) |
|---|---|---|
| `scum.MaximumNumberOfExpandedElementsPerFlag` | int | `75` |
| `scum.NumberOfAllowedFlagsPerPlayer` | int | `10` |
| `scum.EnableSquadMemberNameWidget` | bool | `0` |
| `scum.PlantHarvestExamineTimeMultiplier` | float | `1.00` |
| `scum.FirstPlantHarvestAdditionalChance` | float | `1.00` |
| `scum.MaxQuestsPerCyclePerTrader` | int | `3` |
| `scum.MaxSimultaneousQuestsPerTrader` | bool | `1` |
| `scum.EnableBCULocking` | bool | `1` |
| `scum.EnableNewPlayerProtection` | bool | `1` |
| `scum.EnableDigitalDeluxeStarterPack` | bool | `1` |
| `scum.EnableDigitalDeluxeFreeGoldCard` | bool | `1` |
| `scum.EnableNetWatchdog` | bool | `0` |
| `scum.EnableNetworkObjectLogging` | bool | `0` |


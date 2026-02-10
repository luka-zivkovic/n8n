<script setup lang="ts">
import { ref } from 'vue';
import { N8nText, N8nLink, N8nButton, N8nIcon, N8nTooltip } from '@n8n/design-system';
import { useI18n } from '@n8n/i18n';
import type { BaseTextKey } from '@n8n/i18n';
import type { SecurityFinding } from '../scanner/types';
import SecuritySeverityTag from './SecuritySeverityTag.vue';

defineOptions({ name: 'SecurityFindingCard' });

const props = defineProps<{
	finding: SecurityFinding;
	isAiAvailable: boolean;
}>();

const emit = defineEmits<{
	navigate: [nodeName: string];
	fixWithAi: [finding: SecurityFinding];
}>();

const i18n = useI18n();
const isRemediationOpen = ref(false);

function onNavigate() {
	emit('navigate', props.finding.nodeName);
}

function onFixWithAi() {
	emit('fixWithAi', props.finding);
}
</script>

<template>
	<div :class="$style.card" data-test-id="security-finding-card">
		<div :class="$style.header">
			<N8nText tag="span" size="small" bold :class="$style.title">
				{{ finding.title }}
			</N8nText>
			<SecuritySeverityTag :severity="finding.severity" />
		</div>

		<N8nText tag="p" size="small" color="text-base" :class="$style.description">
			{{ finding.description }}
		</N8nText>

		<div :class="$style.meta">
			<N8nTooltip
				:content="i18n.baseText('securityScanner.finding.nodeTooltip' as BaseTextKey)"
				placement="top"
				:show-after="300"
			>
				<div :class="$style.metaRow">
					<N8nIcon icon="box" size="small" :class="$style.metaIcon" />
					<N8nLink :class="$style.nodeLink" size="small" @click="onNavigate">
						{{ finding.nodeName }}
						<span :class="$style.arrow">&rarr;</span>
					</N8nLink>
				</div>
			</N8nTooltip>
			<N8nTooltip
				v-if="finding.parameterPath"
				:content="i18n.baseText('securityScanner.finding.parameterTooltip' as BaseTextKey)"
				placement="top"
				:show-after="300"
			>
				<div :class="$style.metaRow">
					<N8nIcon icon="code" size="small" :class="$style.metaIcon" />
					<N8nText tag="span" size="small" color="text-light" :class="$style.paramPath">
						{{ finding.parameterPath }}
					</N8nText>
				</div>
			</N8nTooltip>
		</div>

		<N8nText
			v-if="finding.matchedValue"
			tag="code"
			size="small"
			color="text-light"
			:class="$style.matchedValue"
		>
			{{ finding.matchedValue }}
		</N8nText>

		<div :class="$style.actions">
			<button
				:class="$style.remediationToggle"
				data-test-id="security-finding-remediation-toggle"
				@click="isRemediationOpen = !isRemediationOpen"
			>
				<N8nIcon :icon="isRemediationOpen ? 'chevron-down' : 'chevron-right'" size="small" />
				<N8nText tag="span" size="small" bold>
					{{ i18n.baseText('securityScanner.finding.howToFix' as BaseTextKey) }}
				</N8nText>
			</button>
			<N8nButton
				v-if="isAiAvailable"
				type="tertiary"
				size="mini"
				icon="wand-sparkles"
				data-test-id="security-finding-fix-ai"
				@click="onFixWithAi"
			>
				{{ i18n.baseText('securityScanner.finding.fixWithAi' as BaseTextKey) }}
			</N8nButton>
		</div>

		<N8nText
			v-if="isRemediationOpen"
			tag="p"
			size="small"
			color="text-light"
			:class="$style.remediation"
			data-test-id="security-finding-remediation"
		>
			{{ finding.remediation }}
		</N8nText>
	</div>
</template>

<style module>
.card {
	padding: var(--spacing--xs);
	border: var(--border-width) var(--border-style) light-dark(var(--color--neutral-300), var(--color--neutral-750));
	border-radius: var(--radius--lg);
	background-color: light-dark(var(--color--neutral-white), var(--color--neutral-850));
	color: light-dark(var(--color--neutral-800), var(--color--text));
	display: flex;
	flex-direction: column;
	gap: var(--spacing--4xs);
}

.header {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: var(--spacing--2xs);
}

.title {
	flex: 1;
	min-width: 0;
}

.description {
	margin: 0;
	line-height: var(--line-height--xl);
}

.meta {
	display: flex;
	flex-direction: column;
	gap: var(--spacing--4xs);
	margin: var(--spacing--4xs) 0;
}

.metaRow {
	display: flex;
	align-items: center;
	gap: var(--spacing--4xs);
}

.metaIcon {
	color: light-dark(var(--color--neutral-500), var(--color--neutral-400));
	flex-shrink: 0;
}

.nodeLink {
	cursor: pointer;
	font-weight: var(--font-weight--bold);
	text-decoration: underline;
	text-underline-offset: 2px;
}

.nodeLink:hover {
	text-decoration: none;
}

.arrow {
	margin-left: var(--spacing--4xs);
}

.paramPath {
	font-family: monospace;
	font-size: var(--font-size--2xs);
}

.matchedValue {
	display: block;
	padding: var(--spacing--4xs) var(--spacing--2xs);
	background-color: light-dark(var(--color--neutral-100), var(--color--neutral-900));
	border-radius: var(--radius--sm);
	font-family: monospace;
	font-size: var(--font-size--2xs);
	word-break: break-all;
	color: light-dark(var(--color--neutral-700), var(--color--text--tint-1));
}

.actions {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: var(--spacing--2xs);
	margin-top: var(--spacing--4xs);
}

.remediationToggle {
	display: flex;
	align-items: center;
	gap: var(--spacing--4xs);
	background: none;
	border: none;
	cursor: pointer;
	padding: 0;
	color: light-dark(var(--color--neutral-600), var(--color--neutral-300));
}

.remediationToggle:hover {
	color: light-dark(var(--color--neutral-800), var(--color--neutral-200));
}

.remediation {
	margin: 0;
	padding: var(--spacing--2xs) var(--spacing--xs);
	background-color: light-dark(var(--color--neutral-100), var(--color--neutral-900));
	border-radius: var(--radius);
	line-height: var(--line-height--xl);
	white-space: pre-line;
	color: light-dark(var(--color--neutral-700), var(--color--text--tint-1));
}
</style>

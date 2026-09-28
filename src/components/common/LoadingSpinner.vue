<template>
  <div class="spinner-container" role="status">
    <div class="spinner"></div>
    <span v-if="$slots.default" class="spinner-text"><slot /></span>
  </div>
</template>

<style scoped>
.spinner-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-md);
  padding: var(--space-2xl) var(--space-lg);
}

.spinner {
  width: 30px;
  height: 30px;
  border: 2.5px solid var(--color-accent-soft-strong);
  border-top-color: var(--color-accent);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

.spinner-text {
  color: var(--color-text-muted);
  font-size: 0.88rem;
}
</style>

import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import router from './router/index.js';
import '@fontsource/noto-serif-sc/400.css';
import '@fontsource/noto-serif-sc/700.css';
import './styles/reset.css';
import './styles/variables.css';
import './styles/typography.css';
import './styles/theme.css';

const app = createApp(App);
app.use(createPinia());
app.use(router);
app.mount('#app');

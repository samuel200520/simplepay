require('dotenv').config();
try { require('./src/services/financialIntelligenceEngine'); console.log('Engine OK'); } catch(e) { console.error('Engine FAIL:', e.message); }
try { require('./src/services/llmService'); console.log('LLM OK'); } catch(e) { console.error('LLM FAIL:', e.message); }
try { require('./src/controllers/insightsController'); console.log('Controller OK'); } catch(e) { console.error('Controller FAIL:', e.message); }
try { require('./src/routes/insights'); console.log('Routes OK'); } catch(e) { console.error('Routes FAIL:', e.message); }

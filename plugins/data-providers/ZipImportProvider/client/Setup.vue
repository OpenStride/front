<template>
  <div class="zip-import-provider">
    <h3>Importer un export ZIP d'activités</h3>
    <input type="file" accept=".zip" @change="onFileChange" />
    <div v-if="importing">
      <span>Import en cours...</span>
      <span v-if="totalToImport > 0"> ({{ importedCount }}/{{ totalToImport }})</span>
    </div>
    <div v-if="error" class="error">{{ error }}</div>
    <div v-if="success" class="success">Import terminé !</div>
  </div>
</template>

<script setup lang="ts">
import { getIndexedDBService } from '@/services/IndexedDBService';
import { ref } from 'vue';
import JSZip from 'jszip';
import Papa from 'papaparse';
import FitFileParser from 'fit-file-parser';
import pako from 'pako';
import { adaptZipSummary, adaptZipDetails } from './adapter';

const importing = ref(false);
const error = ref('');
const success = ref(false);
const totalToImport = ref(0);
const importedCount = ref(0);

function onFileChange(e: Event) {
  const files = (e.target as HTMLInputElement).files;
  if (!files || !files[0]) return;
  importing.value = true;
  error.value = '';
  success.value = false;
  totalToImport.value = 0;
  importedCount.value = 0;
  const file = files[0];
  const reader = new FileReader();
  reader.onload = async (ev) => {
    try {
      const zip = await JSZip.loadAsync(ev.target?.result as ArrayBuffer);
      // Liste les fichiers du ZIP
      const fileNames = Object.keys(zip.files);
      console.log('Fichiers dans le ZIP:', fileNames);
      // Lire activities.csv à la racine et parser les activités
      if (zip.files['activities.csv']) {
        const csvContent = await zip.files['activities.csv'].async('string');
        const parsed = Papa.parse(csvContent, { header: true });
        console.log('Colonnes CSV:', parsed.meta.fields);
        // Préparer la liste des activités à importer
        const activitiesToImport: any[] = [];
        const detailsToImport: any[] = [];
        for (const row of parsed.data as any[]) {
          const id = row.id || row.ID || row.activity_id || row.ActivityID || row['Activity ID'];
          if (!id) continue;
          const fitPath = row.filename || row.Filename || row.file || row.FileName || row['File Name'] || `${id}.fit.gz`;
          let fitResult: any = {};
          if (zip.files[fitPath]) {
            // Lire le fichier FIT.gz
            const gzData = await zip.files[fitPath].async('uint8array');
            // Décompresser le .gz avec pako
            let fitData;
            try {
              fitData = pako.ungzip(gzData);
            } catch (err) {
              error.value = 'Erreur de décompression du FIT.gz: ' + (err as any).message;
              continue;
            }
            // Parse le FIT avec fit-file-parser
            try {
              const fitParser = new FitFileParser({ force: true, speedUnit: 'm/s', lengthUnit: 'm', temperatureUnit: 'celsius', elapsedRecordField: true });
              await new Promise<void>((resolve, reject) => {
                fitParser.parse(fitData.buffer, (err, result) => {
                  if (err) {
                    error.value = 'Erreur de parsing FIT: ' + err.message;
                    reject(err);
                  } else {
                    fitResult = result;
                    resolve();
                  }
                });
              });
            } catch (err) {
              error.value = 'Erreur de parsing FIT: ' + (err as any).message;
              continue;
            }
          } else {
            console.log('Activité:', id, 'FIT.gz manquant');
          }
          // Fusionner les infos CSV et FIT
          const activityRaw = {
            ...row,
            ...fitResult,
            samples: fitResult.records || [],
            laps: fitResult.laps || [],
            summary: fitResult.session || fitResult.activity || {},
          };
          // Adapter au format OpenStride
          const activity = adaptZipSummary(activityRaw);
          const details = adaptZipDetails(activityRaw);
          activitiesToImport.push(activity);
          detailsToImport.push(details);
        }
        totalToImport.value = activitiesToImport.length;
        // Déduplication par id
        const uniqueActivities = Object.values(
          activitiesToImport.reduce((acc, act) => {
            acc[act.id] = act;
            return acc;
          }, {} as Record<string, any>)
        );
        const uniqueDetails = Object.values(
          detailsToImport.reduce((acc, det) => {
            acc[det.id] = det;
            return acc;
          }, {} as Record<string, any>)
        );
        // Insertion en base avec vérification des doublons par date de début
        const db = await getIndexedDBService();
        // Récupérer toutes les activités existantes pour comparer les startTime
        const existingActivities = await db.getAllData('activities');
        const existingStartTimes = new Set(existingActivities.map((a: any) => a.startTime));
        for (let i = 0; i < uniqueActivities.length; i++) {
          const act = uniqueActivities[i];
          if (existingStartTimes.has(act.startTime)) {
            console.warn(`Doublon détecté: activité avec startTime ${act.startTime} déjà présente, non importée (id: ${act.id})`);
            continue;
          }
          try {
            await db.addItemsToStore('activities', [act], (a) => a.id);
            await db.addItemsToStore('activity_details', [uniqueDetails[i]], (d) => d.id);
            importedCount.value = importedCount.value + 1;
          } catch (err) {
            console.error('Erreur lors de l’insertion en base:', err);
          }
        }
      }
      importing.value = false;
      success.value = true;
    } catch (err:any) {
      error.value = 'Erreur lors de la lecture du ZIP: ' + err.message;
      importing.value = false;
    }
  };
  reader.onerror = () => {
    error.value = 'Erreur de lecture du fichier ZIP.';
    importing.value = false;
  };
  reader.readAsArrayBuffer(file);
}
</script>

<style scoped>
.zip-import-provider {
  padding: 1.2rem;
}
.error { color: #c00; margin-top: 1rem; }
.success { color: #18794e; margin-top: 1rem; }
</style>

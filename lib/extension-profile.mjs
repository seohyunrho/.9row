import {normalizeProfile,profileSections} from './profile.mjs';

// Only short, explicitly supported application facts leave the local app.
export function extensionProfile(profile) {
  const normalized=normalizeProfile(profile);
  return profileSections.map(section=>({
    key:section.key,label:section.label,
    records:normalized[section.key].map(record=>({
      id:record.id,title:record.schoolName||record.name||section.singular,
      fields:section.fields.filter(f=>f.type!=='textarea').map(f=>({
        key:f.key,label:f.label,type:f.type,value:record[f.key]||''
      }))
    }))
  }));
}

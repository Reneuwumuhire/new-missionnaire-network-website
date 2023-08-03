import { writable, derived } from 'svelte/store';

export const dict = writable();
export const locale = writable('en');

const localizedDict = derived([dict, locale], ([dictInit, localeInit]) => {
 
  if (!dictInit || !localeInit) return;
  
  return(dictInit[localeInit] ?? localeInit );
});

const getMessageFromLocalizedDict = (id:string, localizedDict: any) => {
  const splitId = id.split('.');
  let message = {...localizedDict};

  splitId.forEach((partialId) => {
    message = message[partialId] ?? partialId;
  });
  return(message);
};

const createMessageFormatter = (localizedDict: any) => (id: string) => getMessageFromLocalizedDict(id, localizedDict);

export const t = derived(localizedDict, ($localizedDict) => {
  return(createMessageFormatter($localizedDict));
});
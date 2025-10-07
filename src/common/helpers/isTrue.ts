export const isTrue = (value: string): boolean => {

   value = value.trim().toLowerCase();

   if(value === "true") return true;

   if(value === "false") return false;

}
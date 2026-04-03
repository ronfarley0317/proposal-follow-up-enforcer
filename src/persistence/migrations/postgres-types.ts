export type PostgresMigration = {
  version: number;
  name: string;
  up: string;
};

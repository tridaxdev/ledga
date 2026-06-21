const migrationModules = import.meta.glob<string>("./migrations/*.sql", { eager: true, import: "default" })

export interface MigrationInfo {
    name: string
    sql: string
}

const allMigrations = Object.entries(migrationModules).map(([path, sql]) => ({
    name: path.split("/").pop() ?? path,
    sql
}))

export const migrations: MigrationInfo[] = allMigrations.sort((a, b) => a.name.localeCompare(b.name))

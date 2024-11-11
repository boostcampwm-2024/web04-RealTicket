import { BaseEntity, Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('users')
export class UserEntity extends BaseEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 255, comment: '로그인 ID', name: 'userid' })
  login_id: string;

  @Column({ type: 'varchar', length: 255, comment: '로그인 PW', name: 'password' })
  login_password: string;
}

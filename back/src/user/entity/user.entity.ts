import { BaseEntity, Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('User')
export class UserEntity extends BaseEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 255, comment: '로그인 ID' })
  login_id: string;

  @Column({ type: 'varchar', length: 255, comment: '로그인 PW' })
  login_password: string;
}

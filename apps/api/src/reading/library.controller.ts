import { Controller, Get, NotFoundException, Param, ParseUUIDPipe, UseGuards } from "@nestjs/common";
import { Database } from "../db/connection";
import { AuthGuard } from "./auth/auth.guard";
import { CurrentUser } from "./auth/current-user.decorator";
import type { AuthUser } from "./auth/auth.types";

const verseColumns = `v.id as "verseId", b.name as book, v.chapter, v.verse, v.text,
  concat(b.name, ' ', v.chapter, ':', v.verse) as reference,
  json_build_object('code', t.code, 'name', t.name) as translation`;
const verseTables = `bible_verses v join bible_books b on v.book_id=b.id
  join bible_translations t on t.id=v.translation_id`;

@Controller("api/reading")
export class LibraryController {
  constructor(private readonly database: Database) {}

  @Get("discover")
  async discover() {
    const result = await this.database.pool.query(`select ${verseColumns} from ${verseTables}
      where t.code='KJV' and (b.book_order,v.chapter,v.verse) in
      ((43,1,1),(19,46,10),(20,3,5),(23,40,31),(40,6,34),(50,4,8))
      order by b.book_order,v.chapter,v.verse`);
    return { verses: result.rows };
  }

  @Get("verses/:id/chapter")
  async chapter(@Param("id", ParseUUIDPipe) id: string) {
    const result = await this.database.pool.query(`select ${verseColumns} from ${verseTables}
      join bible_verses anchor on (v.book_id,v.chapter,v.translation_id) =
      (anchor.book_id,anchor.chapter,anchor.translation_id) where anchor.id=$1 order by v.verse`, [id]);
    if (!result.rowCount) throw new NotFoundException("Verse unavailable");
    return { verses: result.rows };
  }

  @Get("library")
  @UseGuards(AuthGuard)
  async library(@CurrentUser() user: AuthUser) {
    const saved = await this.database.pool.query(`select ${verseColumns} from ${verseTables}
      join (select distinct on (verse_id) verse_id,event_type,created_at from user_events
        where user_id=$1 and event_type in ('VERSE_SAVE','VERSE_UNSAVE')
        order by verse_id,created_at desc,id desc) e on e.verse_id=v.id
      where e.event_type='VERSE_SAVE' order by e.created_at desc`, [user.id]);
    const topics = await this.database.pool.query('select topic_id from user_onboarding_topics where user_id=$1', [user.id]);
    const likes = await this.database.pool.query(`select verse_id from (select distinct on (verse_id)
      verse_id,event_type from user_events where user_id=$1 and event_type in ('VERSE_LIKE','VERSE_UNLIKE')
      order by verse_id,created_at desc,id desc) e where event_type='VERSE_LIKE'`, [user.id]);
    return { liked: likes.rows.map(row => row.verse_id), saved: saved.rows, topicIds: topics.rows.map(row => row.topic_id) };
  }
}
